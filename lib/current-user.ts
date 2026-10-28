import { cache } from "react";
import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { userRole, users } from "@/db/schema";

import { auth } from "./auth";
import { getAccountStatus, getUserGroupIds, graphConfigured } from "./graph";
import { getGroupConfig, roleFromGroupIds, type GroupConfig } from "./role-groups";

export type Role = (typeof userRole.enumValues)[number];
export type CurrentUser = typeof users.$inferSelect;

/** Mirror of ABSOLUTE_SESSION_MAX_S in auth.config — belt-and-suspenders cap. */
const ABSOLUTE_SESSION_MAX_S = 10 * 60 * 60;

const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export interface GroupResolution {
  groups: string[];
  source: "bootstrap" | "token" | "graph" | "none";
  role: Role | null;
}

/** Resolve current group membership: live from Microsoft 365 first, the sign-in token as the fallback. */
async function resolveGroups(
  email: string,
  oid: string | undefined,
  tokenGroups: string[],
  overage: boolean,
  cfg: GroupConfig,
): Promise<GroupResolution> {
  if (BOOTSTRAP_ADMINS.includes(email)) {
    return { groups: [], source: "bootstrap", role: "admin" };
  }
  // Live group membership first (≤60s old), so removing someone from a group takes
  // effect now rather than at their next sign-in; the token's list is the fallback.
  if (graphConfigured && oid) {
    const g = await getUserGroupIds(oid);
    if (g !== null) return { groups: g, source: "graph", role: roleFromGroupIds(cfg, g) };
  }
  if (tokenGroups.length > 0 && !overage) {
    return { groups: tokenGroups, source: "token", role: roleFromGroupIds(cfg, tokenGroups) };
  }
  // No reliable signal (claim not configured / overage / Graph unavailable).
  return {
    groups: tokenGroups,
    source: tokenGroups.length ? "token" : "none",
    role: roleFromGroupIds(cfg, tokenGroups),
  };
}

/**
 * Resolves the signed-in Entra identity to a row in `users` (never creating one,
 * except for break-glass admins) and syncing the role from Entra group membership on every request
 * (via `resolveGroups`). Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.email) return null;
  if (
    typeof session.authAt === "number" &&
    Math.floor(Date.now() / 1000) - session.authAt > ABSOLUTE_SESSION_MAX_S
  ) {
    return null; // session past its hard cap — treat as signed out
  }
  const email = session.user.email.toLowerCase();

  // Locked out the moment Microsoft 365 turns the account off (or deletes it) — not when
  // the app's own session eventually expires. ("unknown" = couldn't ask; don't block.)
  if (session.user.oid) {
    const status = await getAccountStatus(session.user.oid);
    if (status === "disabled" || status === "gone") return null;
  }

  const cfg = await getGroupConfig();
  const resolution = await resolveGroups(
    email,
    session.user.oid,
    session.user.groups ?? [],
    !!session.user.groupsOverage,
    cfg,
  );

  let existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  // Signed in under an alias address? Fall back to the Microsoft id we've bound to the row.
  if (!existing && session.user.oid) {
    existing = await db.query.users.findFirst({ where: eq(users.entraOid, session.user.oid) });
  }

  if (existing) {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (!existing.entraOid && session.user.oid) patch.entraOid = session.user.oid;

    // Apply role sync only when we have a trustworthy view of group membership.
    const trustworthy =
      resolution.source === "bootstrap" ||
      resolution.source === "graph" ||
      (resolution.source === "token" && cfg.syncEnabled);

    if (trustworthy && !existing.roleOverride) {
      if (resolution.role && resolution.role !== existing.role) {
        patch.role = resolution.role;
      } else if (!resolution.role && cfg.driven.includes(existing.role)) {
        // Removed from their group => back to Cardholder. Except: never strip the last active admin,
        // so a wrong group mapping can't lock everyone out of Settings.
        let lastAdmin = false;
        if (existing.role === "admin") {
          const [others] = await db
            .select({ n: count() })
            .from(users)
            .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, existing.id)));
          lastAdmin = others.n === 0;
        }
        if (!lastAdmin) patch.role = "cardholder";
      }
    }

    if (Object.keys(patch).length === 0) return existing;
    const [updated] = await db.update(users).set(patch).where(eq(users.id, existing.id)).returning();
    return updated;
  }

  // No app account. Nobody is created on the fly — an admin must add them first —
  // except the break-glass admins, so a fresh install can never lock everyone out.
  if (resolution.source !== "bootstrap") return null;
  const [created] = await db
    .insert(users)
    .values({
      email,
      name: session.user.name ?? email,
      entraOid: session.user.oid ?? null,
      role: "admin",
    })
    .returning();
  return created;
});

/** Session + group diagnostics for the /account page. */
export const getIdentityDiagnostics = cache(async () => {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();
  const cfg = await getGroupConfig();
  const resolution = await resolveGroups(
    email,
    session.user.oid,
    session.user.groups ?? [],
    !!session.user.groupsOverage,
    cfg,
  );
  return {
    email,
    oid: session.user.oid,
    tokenGroups: session.user.groups ?? [],
    tokenGroupsOverage: !!session.user.groupsOverage,
    resolvedGroups: resolution.groups,
    groupSource: resolution.source,
    resolvedRole: resolution.role,
    graphConfigured,
    groupSyncEnabled: cfg.syncEnabled,
    configuredGroups: {
      it: cfg.groups.admin,
      finance: cfg.groups.accounting,
      hr: cfg.groups.payroll,
    },
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!user.active) throw new Error("Account disabled");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("Forbidden");
  return user;
}

/** accounting, approver and admin can all see other people's expenses. */
export function canReview(user: CurrentUser): boolean {
  return user.role === "accounting" || user.role === "approver" || user.role === "admin";
}

/**
 * Who may manage the shared coding tables under Settings — entities, locations,
 * units, jobs, categories, cards. IT (`admin`) plus the finance team
 * (`accounting`). The IT-only tabs (Users, Mileage, Policy, Errors) stay
 * `requireRole("admin")`.
 */
export function canManageSettings(user: CurrentUser): boolean {
  return user.role === "admin" || user.role === "accounting";
}

/**
 * Who owns reimbursements (mileage + out-of-pocket) end to end — the reconcile
 * queue, the approvals queue and the reports dashboard under /payroll. The HR /
 * payroll team (`payroll`, from `HR@iws.world`) plus `admin`. Finance /
 * accounting does not touch reimbursements.
 */
export function canSeePayroll(user: CurrentUser): boolean {
  return user.role === "payroll" || user.role === "admin";
}

/** Anyone with at least one Settings tab: coding tables (accounting) or the
 *  mileage rate (payroll) or everything (admin). */
export function canSeeSettings(user: CurrentUser): boolean {
  return user.role === "admin" || user.role === "accounting" || user.role === "payroll";
}

export function isAdmin(user: CurrentUser): boolean {
  return user.role === "admin";
}
