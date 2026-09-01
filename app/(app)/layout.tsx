import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { canReview, canSeePayroll, canSeeSettings, getCurrentUser, isAdmin } from "@/lib/current-user";

import { AppNav, type Zone } from "./app-nav";

const ME_ZONE: Zone = {
  key: "me",
  label: "My Expenses",
  href: "/expenses",
  matches: ["/", "/expenses", "/receipts", "/cards", "/report", "/summary"],
  nav: [
    { href: "/expenses", label: "My Expenses" },
    { href: "/summary", label: "Summary" },
    { href: "/report", label: "Weekly Report" },
    { href: "/cards", label: "My Cards" },
  ],
};

const ACCOUNTING_ZONE: Zone = {
  key: "accounting",
  label: "Accounting",
  href: "/reconcile",
  matches: ["/reconcile", "/approvals", "/reports"],
  nav: [
    { href: "/reconcile", label: "Reconcile" },
    { href: "/approvals", label: "Approvals" },
    { href: "/reports", label: "Reports" },
  ],
};

const SETTINGS_ZONE: Zone = {
  key: "admin",
  label: "Settings",
  href: "/admin",
  matches: ["/admin"],
  nav: [], // admin/layout.tsx renders its own tab bar
};

const PAYROLL_ZONE: Zone = {
  key: "payroll",
  label: "Payroll",
  href: "/payroll/reconcile",
  matches: ["/payroll"],
  nav: [
    { href: "/payroll/reconcile", label: "Reconcile" },
    { href: "/payroll/approvals", label: "Approvals" },
    { href: "/payroll/reports", label: "Reports" },
  ],
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const zones: Zone[] = [ME_ZONE];
  if (canReview(user)) zones.push(ACCOUNTING_ZONE);
  if (canSeePayroll(user)) zones.push(PAYROLL_ZONE);
  if (canSeeSettings(user)) {
    // Land on the first Settings tab the role can open (Overview is IT-only).
    const href = isAdmin(user)
      ? "/admin"
      : user.role === "payroll"
        ? "/admin/mileage"
        : "/admin/entities";
    zones.push({ ...SETTINGS_ZONE, href });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/expenses" className="flex items-center gap-2">
            <Image src="/brand/iws.png" alt="IWS" width={28} height={28} priority />
            <span className="font-semibold">Expense</span>
          </Link>
          <AppNav zones={zones} />
          <Link href="/account" className="text-xs opacity-60 hover:opacity-100">
            {user.name} · {user.role}
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button type="submit" className="text-xs opacity-70 hover:opacity-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
