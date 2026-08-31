import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Next 16 renamed the "middleware" convention to "proxy". Runs on the edge with
// the DB-free config; the `authorized` callback in authConfig redirects
// unauthenticated requests to /signin.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  void req;
});

export const config = {
  matcher: [
    // `r/` (phone upload page) and `api/receipt-upload` authenticate with a
    // signed token, not a session — keep them out of the auth proxy.
    "/((?!api/auth|api/receipt-upload|api/cron|r/|signin|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
