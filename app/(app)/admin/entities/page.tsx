import Link from "next/link";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { EntityBadge } from "../../../components/entity-badge";

export default async function AdminEntitiesPage() {
  await requireRole("admin", "accounting");
  const rows = await db.query.entities.findMany({
    orderBy: [asc(entities.code)],
    with: { qboSettings: true, qboConnection: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Entities ({rows.length})</h2>
          <p className="text-xs opacity-60">
            The sister companies. Click one to edit its details, set up QuickBooks, or remove it.
          </p>
        </div>
        <Link
          href="/admin/entities/new"
          className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          + Add entity
        </Link>
      </div>

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
        {rows.map((e) => {
          const qbo = e.qboSettings?.enabled
            ? "QuickBooks: export on"
            : e.qboSettings?.realmId
              ? "QuickBooks: export off"
              : "QuickBooks: not set up";
          return (
            <li key={e.id}>
              <Link
                href={`/admin/entities/${e.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                <EntityBadge code={e.code} color={e.brandColor} />
                <span className="font-medium">{e.name}</span>
                {e.legalName ? <span className="opacity-60">{e.legalName}</span> : null}
                <span className="ml-auto flex items-center gap-3 text-xs opacity-60">
                  <span>{qbo}</span>
                  {!e.active ? (
                    <span className="rounded bg-black/10 px-1.5 py-0.5 dark:bg-white/15">retired</span>
                  ) : null}
                  <span aria-hidden>›</span>
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="px-4 py-6 text-sm opacity-60">No entities yet.</li> : null}
      </ul>
    </div>
  );
}
