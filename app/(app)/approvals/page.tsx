import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { approveReport, sendBackReport } from "./actions";

export default async function ApprovalsPage() {
  await requireRole("approver", "admin");

  const reports = await db.query.expenseReports.findMany({
    where: eq(expenseReports.status, "reconciled"),
    orderBy: [asc(expenseReports.periodStart)],
    with: { user: { columns: { name: true } } },
  });

  const reportIds = reports.map((r) => r.id);
  const [cardLines, itemLines] = reportIds.length
    ? await Promise.all([
        db.query.pendingExpenses.findMany({
          where: inArray(pendingExpenses.reportId, reportIds),
        }),
        db.query.expenseItems.findMany({
          where: inArray(expenseItems.reportId, reportIds),
        }),
      ])
    : [[], []];

  const booksTotal = (rid: string) =>
    cardLines
      .filter((l) => l.reportId === rid)
      .reduce((s, l) => s + (l.actualAmountCents ?? l.amountCents), 0) +
    itemLines.filter((l) => l.reportId === rid).reduce((s, l) => s + l.amountCents, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Approvals</h1>
      <p className="max-w-prose text-sm opacity-70">
        Weekly reports accounting has reconciled. Approving locks the report — every line is final and
        ready for the books.
      </p>

      {reports.length === 0 ? (
        <p className="text-sm opacity-60">Nothing waiting for approval.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const cards = cardLines.filter((l) => l.reportId === r.id);
            const items = itemLines.filter((l) => l.reportId === r.id);
            return (
              <div key={r.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{r.user.name}</span>
                  <span className="text-sm opacity-60">
                    {shortDate(r.periodStart)} – {shortDate(r.periodEnd)}
                  </span>
                  <span className="font-semibold">{money(booksTotal(r.id))}</span>
                </div>
                <p className="mt-1 text-sm opacity-70">
                  {cards.length} card · {items.filter((i) => i.kind === "out_of_pocket").length} out
                  of pocket · {items.filter((i) => i.kind === "mileage").length} mileage
                  {cards.some((c) => c.actualAmountCents && c.actualAmountCents !== c.amountCents)
                    ? " · has amount corrections"
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={approveReport}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
                      Approve report
                    </button>
                  </form>
                  <form action={sendBackReport} className="flex gap-1">
                    <input type="hidden" name="reportId" value={r.id} />
                    <input
                      name="reason"
                      placeholder="reason"
                      className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20"
                    />
                    <button className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white">
                      Send back
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
