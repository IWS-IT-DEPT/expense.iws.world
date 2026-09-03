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

/**
 * Session lifetimes. Auth.js gates *getting* a session behind Entra (and thus
 * MFA / Conditional Access); these control how long the app then trusts it.
 *   - IDLE: sliding — logged out this long after the last activity.
 *   - ABSOLUTE: hard cap from sign-in regardless of activity, so everyone
 *     re-authenticates (and re-satisfies MFA) at least daily.
 * For a fixed re-MFA cadence, pair this with an Entra Conditional Access
 * "sign-in frequency" policy scoped to this app.
 */
const IDLE_SESSION_MAX_S = 8 * 60 * 60; // 8 hours
const ABSOLUTE_SESSION_MAX_S = 10 * 60 * 60; // 10 hours

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
  providers: [
    MicrosoftEntraID({
      // User.Read lets the delegated token hit Graph /me if ever needed; the
      // group -> role sync itself uses app-only Graph (see lib/graph.ts).
      authorization: { params: { scope: "openid profile email offline_access User.Read" } },
    }),
  ],
  pages: { signIn: "/signin" },
  session: {
    strategy: "jwt",
    maxAge: IDLE_SESSION_MAX_S,
    updateAge: 15 * 60, // re-issue the cookie at most every 15 min of activity
  },
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
      if (account) token.authAt = Math.floor(Date.now() / 1000);

      // On initial sign-in, pull oid + the "groups" claim. Entra puts groups in
      // the id_token (Token configuration -> groups claim), which isn't always
      // surfaced on `profile`, so decode the id_token directly as the source.
      if (account || profile) {
        const claims = account?.id_token
          ? decodeJwtPayload(account.id_token as string)
          : ((profile as Record<string, unknown>) ?? {});

        token.oid = (claims.oid as string | undefined) ?? token.oid;
        token.email =
          emailFromProfile({ ...(profile as Record<string, unknown>), ...claims }) || token.email;
        token.groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];
        // Entra emits _claim_names when the groups list overflows the token.
        token.groupsOverage = !!(claims as Record<string, unknown>)._claim_names;
      }

      // Hard absolute cap — force a fresh sign-in (and MFA) regardless of activity.
      if (
        typeof token.authAt === "number" &&
        Math.floor(Date.now() / 1000) - token.authAt > ABSOLUTE_SESSION_MAX_S
      ) {
        return null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.oid = token.oid as string | undefined;
        session.user.groups = (token.groups as string[] | undefined) ?? [];
        session.user.groupsOverage = !!token.groupsOverage;
      }
      if (typeof token.authAt === "number") session.authAt = token.authAt;
      return session;
    },
  },
} satisfies NextAuthConfig;
