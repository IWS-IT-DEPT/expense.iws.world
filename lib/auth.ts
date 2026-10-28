import { eq, or } from "drizzle-orm";
import NextAuth from "next-auth";

import { db } from "@/db";
import { users } from "@/db/schema";

import { authConfig, emailFromProfile } from "./auth.config";

const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Being in our Microsoft 365 tenant is not enough: you must also have an app
 * account an admin created (Settings → Users → Add user) and it must be active.
 * Anyone else is turned away at the door and nothing is created for them. The
 * only exception is the break-glass BOOTSTRAP_ADMIN_EMAILS list.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn(params) {
      // 1. tenant + allowed-domain checks (edge-safe, in auth.config)
      if (!(await authConfig.callbacks.signIn(params as never))) return false;

      const profile = params.profile as Record<string, unknown> | undefined;
      const email = emailFromProfile(profile);
      const oid = typeof profile?.oid === "string" ? profile.oid : undefined;
      if (BOOTSTRAP_ADMINS.includes(email)) return true;

      // 2. must already have an app account (matched by email, or by Microsoft id for alias addresses)
      const row = await db.query.users.findFirst({
        where: oid ? or(eq(users.email, email), eq(users.entraOid, oid)) : eq(users.email, email),
        columns: { active: true },
      });
      if (!row) return "/signin?error=NoAccount";
      if (!row.active) return "/signin?error=Disabled";
      return true;
    },
  },
});
