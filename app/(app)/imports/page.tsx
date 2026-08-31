import { asc, desc } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, transactions } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { ImportForm } from "./import-form";

export default async function ImportsPage() {
  await requireRole("accounting", "admin");

  const [accounts, recent] = await Promise.all([
    db.query.cardAccounts.findMany({
      where: (c, { eq }) => eq(c.active, true),
      orderBy: [asc(cardAccounts.name)],
    }),
    db.query.transactions.findMany({
      orderBy: [desc(transactions.importedAt)],
      limit: 15,
      with: { cardAccount: true, assignedUser: true },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Statement Import</h1>
        <p className="text-sm opacity-70">
          Upload a Capital One or Amex statement CSV. Re-importing the same file is safe — duplicates
          are skipped.
        </p>
      </div>

      <ImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Recently imported
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {recent.map((t) => (
              <tr key={t.id} className="border-t border-black/10 dark:border-white/10">
                <td className="py-1.5">{shortDate(t.txnDate)}</td>
                <td>{t.merchantRaw}</td>
                <td className="opacity-60">{t.cardAccount.name}</td>
                <td className="opacity-60">{t.assignedUser?.name ?? "unassigned"}</td>
                <td className="text-right">{money(t.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
