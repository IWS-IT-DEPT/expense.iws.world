import { eq, or } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/db";
import { users } from "@/db/schema";

import { authConfig, emailFromProfile } from "./auth.config";
import { verifyLoginCode } from "./login-code";

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
  providers: [
    ...authConfig.providers,
    // Emailed one-time code, for people an admin flagged `emailLogin` (no M365 account).
    // authorize() has already checked the code, the flag and that the user is active.
    Credentials({
      id: "email-code",
      name: "Email code",
      credentials: { email: {}, code: {} },
      async authorize(credentials, request) {
        const ip =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const user = await verifyLoginCode(String(credentials?.email ?? ""), String(credentials?.code ?? ""), ip);
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn(params) {
      // Email-code sign-ins were fully vetted in authorize(); they have no M365 profile/tenant to check.
      if (params.account?.provider === "email-code") return true;

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
