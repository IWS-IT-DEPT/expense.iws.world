import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { money, shortDate, weekBounds } from "@/lib/format";

import { submitWeeklyReport } from "./actions";

export default async function WeeklyReportPage() {
  const user = await requireUser();
  const { start, end } = weekBounds(new Date());

  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.assignedUserId, user.id),
      gte(transactions.txnDate, start),
      lte(transactions.txnDate, end),
    ),
    with: { allocations: { with: { entity: true, category: true } } },
  });

  const uncoded = rows.filter((t) => t.status === "uncoded" || t.status === "rejected");
  const coded = rows.filter((t) => t.status === "coded");
  const submitted = rows.filter((t) => ["submitted", "in_review", "approved", "exported"].includes(t.status));
  const total = rows.reduce((s, t) => s + t.amountCents, 0);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Weekly Report</h1>
        <p className="text-sm opacity-70">
          {shortDate(start)} – {shortDate(end)} · {rows.length} charges · {money(total)}
        </p>
      </div>

      {uncoded.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 text-sm">
          <strong>{uncoded.length} charge{uncoded.length > 1 ? "s" : ""} still need coding.</strong>
          <ul className="mt-2 space-y-1">
            {uncoded.map((t) => (
              <li key={t.id}>
                <Link href={`/transactions/${t.id}`} className="underline">
                  {shortDate(t.txnDate)} · {t.merchantRaw} · {money(t.amountCents)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Ready to submit ({coded.length})
        </h2>
        <ul className="space-y-1 text-sm">
          {coded.map((t) => (
            <li key={t.id} className="flex justify-between">
              <span>
                {shortDate(t.txnDate)} · {t.merchantRaw} · {t.allocations[0]?.entity.code} /{" "}
                {t.allocations[0]?.category.name}
              </span>
              <span>{money(t.amountCents)}</span>
            </li>
          ))}
          {coded.length === 0 && <li className="opacity-60">Nothing coded yet.</li>}
        </ul>
      </section>

      <form action={submitWeeklyReport}>
        <input type="hidden" name="periodStart" value={start} />
        <input type="hidden" name="periodEnd" value={end} />
        <button
          type="submit"
          disabled={coded.length === 0 || uncoded.length > 0}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          Submit week ({coded.length})
        </button>
        {uncoded.length > 0 && (
          <span className="ml-3 text-xs opacity-60">Code everything first.</span>
        )}
      </form>

      {submitted.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
            Already submitted ({submitted.length})
          </h2>
          <ul className="space-y-1 text-sm opacity-70">
            {submitted.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span>
                  {shortDate(t.txnDate)} · {t.merchantRaw} · <em>{t.status}</em>
                </span>
                <span>{money(t.amountCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs opacity-50">
        Out-of-pocket and mileage entry lands here next — see the project README roadmap.
      </p>
    </div>
  );
}
