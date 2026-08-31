import Link from "next/link";
import { asc, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  cardAccounts,
  categories,
  entities,
  jobs,
  locations,
  units,
  users,
} from "@/db/schema";
import { shortDate } from "@/lib/format";

const groupSyncOn = !!(process.env.ENTRA_GROUP_IT && process.env.ENTRA_GROUP_FINANCE);

export default async function AdminOverviewPage() {
  const [entityRows, accountRows, counts] = await Promise.all([
    db.query.entities.findMany({ orderBy: [asc(entities.code)], with: { qboConnection: true } }),
    db.query.cardAccounts.findMany({ orderBy: [asc(cardAccounts.name)], with: { cards: true } }),
    Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(users),
      db.select({ n: sql<number>`count(*)` }).from(locations),
      db.select({ n: sql<number>`count(*)` }).from(units),
      db.select({ n: sql<number>`count(*)` }).from(jobs),
      db.select({ n: sql<number>`count(*)` }).from(categories),
    ]),
  ]);
  const [nUsers, nLoc, nUnit, nJob, nCat] = counts.map((c) => c[0].n);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <h2 className="mb-1 font-medium">Access control</h2>
        <p className="opacity-70">
          {groupSyncOn ? (
            <>
              Role sync is <strong>ON</strong>. <code>IT@iws.world</code> → admin,{" "}
              <code>IWS-Finance@iws.world</code> → accounting, applied on every login.
            </>
          ) : (
            <>
              Role sync is <strong>OFF</strong> — set <code>ENTRA_GROUP_IT</code> and{" "}
              <code>ENTRA_GROUP_FINANCE</code> to the group Object Ids. Until then roles are managed
              on the Users tab.
            </>
          )}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card href="/admin/users" label="Users" value={nUsers} />
        <Card href="/admin/locations" label="Locations" value={nLoc} />
        <Card href="/admin/units" label="Units" value={nUnit} />
        <Card href="/admin/jobs" label="Jobs" value={nJob} />
        <Card href="/admin/categories" label="Categories" value={nCat} />
        <Card href="/imports" label="Statement import" value="→" />
      </section>

      <section>
        <h2 className="mb-2 font-medium">Entities & QuickBooks</h2>
        <ul className="text-sm">
          {entityRows.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-t border-black/10 py-1 dark:border-white/10">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: e.brandColor ?? "#999" }}
              />
              <span className="font-mono">{e.code}</span>
              <span className="opacity-70">{e.name}</span>
              <span className="ml-auto text-xs opacity-50">
                costing {e.costingMode} · QBO {e.qboConnection?.status ?? "disconnected"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Card accounts</h2>
        <ul className="text-sm">
          {accountRows.map((a) => (
            <li key={a.id} className="border-t border-black/10 py-1 dark:border-white/10">
              {a.name} · {a.cards.length} card(s) ·{" "}
              {a.lastImportedAt ? `last import ${shortDate(a.lastImportedAt)}` : "never imported"}
            </li>
          ))}
        </ul>
        <Link href="/admin/cards" className="text-sm underline">
          Manage cards →
        </Link>
      </section>
    </div>
  );
}

function Card({ href, label, value }: { href: string; label: string; value: number | string }) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm opacity-70">{label}</div>
    </Link>
  );
}
