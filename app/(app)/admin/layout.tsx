import Link from "next/link";

import { isAdmin, requireRole, type Role } from "@/lib/current-user";

/** `roles` lists the non-admin roles that also see the tab; admin sees all. */
const tabs: { href: string; label: string; roles: Role[] }[] = [
  { href: "/admin", label: "Overview", roles: [] },
  { href: "/admin/users", label: "Users", roles: [] },
  { href: "/admin/entities", label: "Entities", roles: ["accounting"] },
  { href: "/admin/locations", label: "Locations", roles: ["accounting"] },
  { href: "/admin/units", label: "Units", roles: ["accounting"] },
  { href: "/admin/jobs", label: "Jobs", roles: ["accounting"] },
  { href: "/admin/categories", label: "Categories", roles: ["accounting"] },
  { href: "/admin/cards", label: "Cards", roles: ["accounting"] },
  { href: "/admin/mileage", label: "Mileage", roles: ["payroll"] },
  { href: "/admin/policy", label: "Policy", roles: [] },
  { href: "/admin/errors", label: "Errors", roles: [] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin", "accounting", "payroll");
  const visible = isAdmin(user) ? tabs : tabs.filter((t) => t.roles.includes(user.role));

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
