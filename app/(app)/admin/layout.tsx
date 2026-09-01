import Link from "next/link";

import { isAdmin, requireRole } from "@/lib/current-user";

const tabs = [
  { href: "/admin", label: "Overview", adminOnly: true },
  { href: "/admin/users", label: "Users", adminOnly: true },
  { href: "/admin/entities", label: "Entities", adminOnly: false },
  { href: "/admin/locations", label: "Locations", adminOnly: false },
  { href: "/admin/units", label: "Units", adminOnly: false },
  { href: "/admin/jobs", label: "Jobs", adminOnly: false },
  { href: "/admin/categories", label: "Categories", adminOnly: false },
  { href: "/admin/cards", label: "Cards", adminOnly: false },
  { href: "/admin/mileage", label: "Mileage", adminOnly: true },
  { href: "/admin/policy", label: "Policy", adminOnly: true },
  { href: "/admin/errors", label: "Errors", adminOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin", "accounting");
  const visible = isAdmin(user) ? tabs : tabs.filter((t) => !t.adminOnly);

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b border-black/10 pb-2 text-sm dark:border-white/15">
        {visible.map((t) => (
          <Link key={t.href} href={t.href} className="opacity-70 hover:opacity-100">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
