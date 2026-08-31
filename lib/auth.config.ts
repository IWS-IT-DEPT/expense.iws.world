import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/**
 * Edge-safe auth config (no database access). Shared by `middleware.ts` and the
 * full `lib/auth.ts`. Database-backed user/role resolution lives in
 * `lib/current-user.ts`, called from server components and route handlers.
 */

const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function emailFromProfile(profile: Record<string, unknown> | undefined): string {
  const raw =
    (profile?.email as string | undefined) ??
    (profile?.preferred_username as string | undefined) ??
    "";
  return raw.toLowerCase();
}

export const authConfig = {
  providers: [MicrosoftEntraID],
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    /** Lock sign-in to the company's M365 tenant domain(s). */
    signIn({ profile }) {
      const email = emailFromProfile(profile as Record<string, unknown>);
      if (!email) return false;
      if (allowedDomains.length === 0) return true; // dev convenience
      return allowedDomains.some((d) => email.endsWith(`@${d}`));
    },
    /** Gate every matched route on an authenticated session. */
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, profile }) {
      if (profile) {
        token.oid = (profile.oid as string | undefined) ?? token.oid;
        token.email = emailFromProfile(profile as Record<string, unknown>) || token.email;
        // Entra "groups" claim — configured in the app registration
        // (Token configuration -> groups -> "Groups assigned to the application").
        const groups = (profile as Record<string, unknown>).groups;
        token.groups = Array.isArray(groups) ? (groups as string[]) : [];
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.oid = token.oid as string | undefined;
        session.user.groups = (token.groups as string[] | undefined) ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
