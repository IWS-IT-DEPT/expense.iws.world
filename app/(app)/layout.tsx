import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { canReview, getCurrentUser } from "@/lib/current-user";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "My Transactions" },
  { href: "/report", label: "Weekly Report" },
];

const reviewNav = [
  { href: "/review", label: "Review Queue" },
  { href: "/admin", label: "Admin" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const items = canReview(user) ? [...navItems, ...reviewNav] : navItems;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-semibold">IWS Expense</span>
          <nav className="flex flex-1 gap-4 text-sm">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="opacity-70 hover:opacity-100">
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="text-xs opacity-60">
            {user.name} · {user.role}
          </span>
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
