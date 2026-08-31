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

/** Decode a JWT payload without verifying (already validated by the OIDC flow). */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
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
    jwt({ token, profile, account }) {
      // On initial sign-in, pull oid + the "groups" claim. Entra puts groups in
      // the id_token (Token configuration -> groups claim), which isn't always
      // surfaced on `profile`, so decode the id_token directly as the source.
      const claims = account?.id_token
        ? decodeJwtPayload(account.id_token as string)
        : ((profile as Record<string, unknown>) ?? {});

      if (account || profile) {
        token.oid = (claims.oid as string | undefined) ?? token.oid;
        token.email =
          emailFromProfile({ ...(profile as Record<string, unknown>), ...claims }) || token.email;
        if (Array.isArray(claims.groups)) token.groups = claims.groups as string[];
        else if (!token.groups) token.groups = [];
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
