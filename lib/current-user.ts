import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userRole, users } from "@/db/schema";

import { auth } from "./auth";

export type Role = (typeof userRole.enumValues)[number];
export type CurrentUser = typeof users.$inferSelect;

/**
 * Resolves the signed-in Entra identity to a row in `users`, auto-provisioning
 * on first login (role defaults to `cardholder`; an admin promotes from there).
 * Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.toLowerCase();

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    if (!existing.entraOid && session.user.oid) {
      await db.update(users).set({ entraOid: session.user.oid }).where(eq(users.id, existing.id));
    }
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: session.user.name ?? email,
      entraOid: session.user.oid ?? null,
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
