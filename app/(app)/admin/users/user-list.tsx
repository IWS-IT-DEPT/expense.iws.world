"use client";

import Link from "next/link";
import { useState } from "react";

export interface UserListRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  entityCode: string | null;
}

/** Searchable list of users; each row opens that user's page. */
export function UserList({ users }: { users: UserListRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? users.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(needle))
    : users;

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email or role…"
        className="min-h-11 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20"
      />
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
        {shown.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="press flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
            >
              <span className={`font-medium ${u.active ? "" : "opacity-50"}`}>{u.name}</span>
              <span className="opacity-60">{u.email}</span>
              <span className="ml-auto flex items-center gap-2 text-xs">
                {u.entityCode ? <span className="font-mono opacity-60">{u.entityCode}</span> : null}
                <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">{u.role}</span>
                {!u.active ? (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-700 dark:text-red-300">inactive</span>
                ) : null}
                <span aria-hidden className="opacity-40">
                  ›
                </span>
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-4 py-6 text-sm opacity-60">No users match.</li> : null}
      </ul>
    </div>
  );
}
