import Link from "next/link";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { UserList } from "./user-list";

export default async function AdminUsersPage() {
  await requireRole("admin");
  const rows = await db.query.users.findMany({
    orderBy: [asc(users.name)],
    with: { homeEntity: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Users ({rows.length})</h2>
          <p className="text-xs opacity-60">
            People are added automatically the first time they sign in. Click one to change their role,
            home entity or access.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="press rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          + Add user
        </Link>
      </div>
      <UserList
        users={rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          entityCode: u.homeEntity?.code ?? null,
        }))}
      />
    </div>
  );
}
