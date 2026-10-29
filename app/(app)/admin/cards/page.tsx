import Link from "next/link";
import { asc } from "drizzle-orm";

import { db } from "@/db";
import { cards } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { cardLabel } from "../../expenses/coding-options";

export default async function AdminCardsPage() {
  await requireRole("admin", "accounting");
  const rows = await db.query.cards.findMany({ orderBy: [asc(cards.last4)], with: { user: true } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Cards ({rows.length})</h2>
          <p className="text-xs opacity-60">
            Cardholders register their own cards on My Cards. Click one to fix a typo, reassign it, turn it
            off if it&apos;s lost, or delete it.
          </p>
        </div>
        <Link
          href="/admin/cards/new"
          className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          + Add card
        </Link>
      </div>

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/cards/${c.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
            >
              <span className="font-medium">{cardLabel(c)}</span>
              <span className="opacity-60">{c.user?.name ?? "unassigned"}</span>
              <span className="ml-auto flex items-center gap-3 text-xs opacity-60">
                {!c.active ? (
                  <span className="rounded bg-black/10 px-1.5 py-0.5 dark:bg-white/15">turned off</span>
                ) : null}
                <span aria-hidden>›</span>
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-4 py-6 text-sm opacity-60">No cards registered yet.</li> : null}
      </ul>
    </div>
  );
}
