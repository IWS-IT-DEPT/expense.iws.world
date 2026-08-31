import Link from "next/link";

import { requireRole } from "@/lib/current-user";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/entities", label: "Entities" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/units", label: "Units" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/cards", label: "Cards" },
  { href: "/admin/mileage", label: "Mileage" },
  { href: "/admin/policy", label: "Policy" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b border-black/10 pb-2 text-sm dark:border-white/15">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="opacity-70 hover:opacity-100">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
