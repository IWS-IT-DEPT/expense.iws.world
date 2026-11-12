import Link from "next/link";

import { getCurrentUser } from "@/lib/current-user";

const ROLE_LABEL: Record<string, string> = {
  cardholder: "Employee",
  approver: "Approver",
  accounting: "Accounting",
  payroll: "Payroll",
  admin: "Admin",
};

/**
 * Shown when a signed-in person opens a page (or runs an action) their role
 * doesn't allow — thrown by `requireRole()` via `forbidden()`.
 */
export default async function Forbidden() {
  const user = await getCurrentUser();
  const role = user ? (ROLE_LABEL[user.role] ?? user.role) : null;

  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-sm">
        {role ? (
          <>
            You&apos;re signed in as <strong>{user?.email}</strong> with the <strong>{role}</strong> role,
            which doesn&apos;t include this page.
          </>
        ) : (
          "Your account doesn't include this page."
        )}
      </p>
      <p className="text-sm opacity-80">
        If you think you should have access, ask IT (<a className="underline" href="mailto:IT@iws.world">IT@iws.world</a>)
        to change your role, and tell them which page you were trying to open. Your role comes from your
        Microsoft 365 group, so it can take a fresh sign-in to update.
      </p>
      <Link href="/" className="inline-block rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
        Back to home
      </Link>
    </div>
  );
}
