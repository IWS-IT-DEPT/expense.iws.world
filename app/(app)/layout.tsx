import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { canReview, getCurrentUser, isAdmin } from "@/lib/current-user";

import { AppNav, type Zone } from "./app-nav";

const ME_ZONE: Zone = {
  key: "me",
  label: "My Expenses",
  href: "/",
  matches: ["/", "/transactions", "/report"],
  nav: [
    { href: "/", label: "Dashboard" },
    { href: "/transactions", label: "My Transactions" },
    { href: "/report", label: "Weekly Report" },
  ],
};

const ACCOUNTING_ZONE: Zone = {
  key: "accounting",
  label: "Accounting",
  href: "/review",
  matches: ["/review", "/imports"],
  nav: [
    { href: "/review", label: "Review Queue" },
    { href: "/imports", label: "Imports" },
  ],
};

const ADMIN_ZONE: Zone = {
  key: "admin",
  label: "IT Admin",
  href: "/admin",
  matches: ["/admin"],
  nav: [], // admin/layout.tsx renders its own tab bar
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const zones: Zone[] = [ME_ZONE];
  if (canReview(user)) zones.push(ACCOUNTING_ZONE);
  if (isAdmin(user)) zones.push(ADMIN_ZONE);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
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
