import { asc, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  cardAccounts,
  categories,
  entities,
  jobs,
  locations,
  mileageRates,
  units,
} from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { shortDate } from "@/lib/format";

import { ImportForm } from "./import-form";

export default async function AdminPage() {
  await requireRole("accounting", "admin");

  const [entityRows, accountRows, rateRows, counts] = await Promise.all([
    db.query.entities.findMany({
      orderBy: [asc(entities.code)],
      with: { qboConnection: true },
    }),
    db.query.cardAccounts.findMany({
      orderBy: [asc(cardAccounts.name)],
      with: { owningEntity: true, cards: true },
    }),
    db.query.mileageRates.findMany({ orderBy: [asc(mileageRates.effectiveDate)] }),
    Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(locations),
      db.select({ n: sql<number>`count(*)` }).from(units),
      db.select({ n: sql<number>`count(*)` }).from(jobs),
      db.select({ n: sql<number>`count(*)` }).from(categories),
    ]),
  ]);

  const [loc, unit, job, cat] = counts.map((c) => c[0].n);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Admin</h1>

      <ImportForm accounts={accountRows.map((a) => ({ id: a.id, name: a.name }))} />

      <section>
        <h2 className="mb-2 font-medium">Entities & QuickBooks</h2>
        <table className="w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-1">Code</th>
              <th>Name</th>
              <th>Costing</th>
              <th>QBO</th>
            </tr>
          </thead>
          <tbody>
            {entityRows.map((e) => (
              <tr key={e.id} className="border-t border-black/10 dark:border-white/10">
                <td className="py-1 font-mono">{e.code}</td>
                <td>{e.name}</td>
                <td>{e.costingMode}</td>
                <td>{e.qboConnection?.status ?? "disconnected"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Card accounts</h2>
        <ul className="text-sm">
          {accountRows.map((a) => (
            <li key={a.id} className="border-t border-black/10 py-1 dark:border-white/10">
              {a.name} — owner {a.owningEntity.code} · {a.cards.length} card(s) ·{" "}
              {a.lastImportedAt ? `last import ${shortDate(a.lastImportedAt)}` : "never imported"}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Mileage rates (IRS)</h2>
        <ul className="text-sm">
          {rateRows.map((r) => (
            <li key={r.id}>
              from {r.effectiveDate}: ${r.ratePerMile}/mi {r.note ? `— ${r.note}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="text-sm opacity-70">
        <h2 className="mb-2 font-medium opacity-100">Reference data</h2>
        <p>
          {loc} locations · {unit} units · {job} jobs · {cat} categories.
        </p>
        <p className="mt-1">
          Managed via <code>db/seed.ts</code> and <code>npm run db:studio</code> for now. Admin CRUD
          screens are on the roadmap (see README).
        </p>
      </section>
    </div>
  );
}
