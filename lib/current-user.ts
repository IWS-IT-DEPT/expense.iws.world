import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userRole, users } from "@/db/schema";

import { auth } from "./auth";

export type Role = (typeof userRole.enumValues)[number];
export type CurrentUser = typeof users.$inferSelect;

const GROUP_IT = process.env.ENTRA_GROUP_IT?.trim();
const GROUP_FINANCE = process.env.ENTRA_GROUP_FINANCE?.trim();
const GROUP_SYNC_ENABLED = !!(GROUP_IT && GROUP_FINANCE);

const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** admin/accounting come from Entra groups; approver/cardholder are set manually. */
const GROUP_DRIVEN: Role[] = ["admin", "accounting"];

/** Map Entra group membership to a role. Highest privilege wins. */
export function roleFromGroups(groupIds: string[]): Role | null {
  if (GROUP_IT && groupIds.includes(GROUP_IT)) return "admin";
  if (GROUP_FINANCE && groupIds.includes(GROUP_FINANCE)) return "accounting";
  return null;
}

/**
 * Resolves the signed-in Entra identity to a row in `users`, provisioning on
 * first login and syncing the role from Entra group membership on every login
 * (once ENTRA_GROUP_IT + ENTRA_GROUP_FINANCE are set).
 * Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();
  const groups = session.user.groups ?? [];

  const bootstrap = BOOTSTRAP_ADMINS.includes(email);
  const groupRole = bootstrap ? "admin" : roleFromGroups(groups);

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existing) {
    const patch: Partial<typeof users.$inferInsert> = {};
    if (!existing.entraOid && session.user.oid) patch.entraOid = session.user.oid;

    if (GROUP_SYNC_ENABLED || bootstrap) {
      if (groupRole && groupRole !== existing.role) {
        patch.role = groupRole;
      } else if (!groupRole && GROUP_DRIVEN.includes(existing.role)) {
        // Removed from IT/Finance -> drop back to cardholder.
        patch.role = "cardholder";
      }
    }

    if (Object.keys(patch).length === 0) return existing;
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: session.user.name ?? email,
      entraOid: session.user.oid ?? null,
      role: groupRole ?? "cardholder",
    })
    .returning();
  return created;
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

export function isAdmin(user: CurrentUser): boolean {
  return user.role === "admin";
}
