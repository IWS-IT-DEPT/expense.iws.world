import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userRole, users } from "@/db/schema";

import { auth } from "./auth";
import { getUserGroupIds, graphConfigured } from "./graph";

export type Role = (typeof userRole.enumValues)[number];
export type CurrentUser = typeof users.$inferSelect;

const GROUP_IT = process.env.ENTRA_GROUP_IT?.trim();
const GROUP_FINANCE = process.env.ENTRA_GROUP_FINANCE?.trim();
/** HR / payroll team — handles mileage + out-of-pocket reimbursements. */
const GROUP_PAYROLL = process.env.ENTRA_GROUP_HR?.trim();
const GROUP_SYNC_ENABLED = !!(GROUP_IT && GROUP_FINANCE);

const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** admin/accounting/payroll come from Entra groups; approver/cardholder are set manually. */
const GROUP_DRIVEN: Role[] = ["admin", "accounting", "payroll"];

/** Map Entra group membership to a role. Highest privilege wins. */
export function roleFromGroups(groupIds: string[]): Role | null {
  if (GROUP_IT && groupIds.includes(GROUP_IT)) return "admin";
  if (GROUP_FINANCE && groupIds.includes(GROUP_FINANCE)) return "accounting";
  if (GROUP_PAYROLL && groupIds.includes(GROUP_PAYROLL)) return "payroll";
  return null;
}

export interface GroupResolution {
  groups: string[];
  source: "bootstrap" | "token" | "graph" | "none";
  role: Role | null;
}

/** Resolve current group membership: token claim first, Graph as the fallback. */
async function resolveGroups(
  email: string,
  oid: string | undefined,
  tokenGroups: string[],
  overage: boolean,
): Promise<GroupResolution> {
  if (BOOTSTRAP_ADMINS.includes(email)) {
    return { groups: [], source: "bootstrap", role: "admin" };
  }
  if (tokenGroups.length > 0 && !overage) {
    return { groups: tokenGroups, source: "token", role: roleFromGroups(tokenGroups) };
  }
  if (graphConfigured && oid) {
    const g = await getUserGroupIds(oid);
    if (g !== null) return { groups: g, source: "graph", role: roleFromGroups(g) };
  }
  // No reliable signal (claim not configured / overage / Graph unavailable).
  return {
    groups: tokenGroups,
    source: tokenGroups.length ? "token" : "none",
    role: roleFromGroups(tokenGroups),
  };
}

/**
 * Resolves the signed-in Entra identity to a row in `users`, provisioning on
 * first login and syncing the role from Entra group membership on every request
 * (via `resolveGroups`). Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();

  const resolution = await resolveGroups(
    email,
    session.user.oid,
    session.user.groups ?? [],
    !!session.user.groupsOverage,
  );

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existing) {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (!existing.entraOid && session.user.oid) patch.entraOid = session.user.oid;

    // Apply role sync only when we have a trustworthy view of group membership.
    const trustworthy =
      resolution.source === "bootstrap" ||
      resolution.source === "graph" ||
      (resolution.source === "token" && GROUP_SYNC_ENABLED);

    if (trustworthy) {
      if (resolution.role && resolution.role !== existing.role) {
        patch.role = resolution.role;
      } else if (!resolution.role && GROUP_DRIVEN.includes(existing.role)) {
        patch.role = "cardholder"; // removed from IT/Finance
      }
    }

    if (Object.keys(patch).length === 0) return existing;
    const [updated] = await db.update(users).set(patch).where(eq(users.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: session.user.name ?? email,
      entraOid: session.user.oid ?? null,
      role: resolution.role ?? "cardholder",
    })
    .returning();
  return created;
});

/** Session + group diagnostics for the /account page. */
export const getIdentityDiagnostics = cache(async () => {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();
  const resolution = await resolveGroups(
    email,
    session.user.oid,
    session.user.groups ?? [],
    !!session.user.groupsOverage,
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
    groupSyncEnabled: GROUP_SYNC_ENABLED,
    configuredGroups: { it: GROUP_IT, finance: GROUP_FINANCE, hr: GROUP_PAYROLL },
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
