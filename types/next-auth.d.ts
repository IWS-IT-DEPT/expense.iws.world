import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Unix seconds when this session was established (for the absolute cap). */
    authAt?: number;
    user: {
      /** Microsoft Entra object id. */
      oid?: string;
      /** Entra group object ids from the token's `groups` claim. */
      groups?: string[];
      /** True when the token's group list overflowed (claim omitted). */
      groupsOverage?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    oid?: string;
    groups?: string[];
    groupsOverage?: boolean;
    /** Unix seconds when the user signed in — drives the absolute session cap. */
    authAt?: number;
  }
}
