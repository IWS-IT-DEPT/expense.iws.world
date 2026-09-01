import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { approveReport, sendBackReport } from "../actions";

export default async function PayrollApprovalsPage() {
  await requireRole("payroll", "admin");

  const reports = await db.query.expenseReports.findMany({
    where: eq(expenseReports.status, "reconciled"),
    orderBy: [asc(expenseReports.periodStart)],
    with: { user: { columns: { name: true } } },
  });

  const reportIds = reports.map((r) => r.id);
  const items = reportIds.length
    ? await db.query.expenseItems.findMany({ where: inArray(expenseItems.reportId, reportIds) })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Approvals</h1>
        <p className="text-sm opacity-70">
          Reconciled reimbursement reports — every line has been checked. Approve to lock the report
          for payment, or send the whole report back.
        </p>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm opacity-60">Nothing reconciled is waiting for approval.</p>
      ) : (
        reports.map((r) => {
          const mine = items.filter((i) => i.reportId === r.id && i.status === "reconciled");
          const total = mine.reduce((s, i) => s + i.amountCents, 0);
          const miles = mine.reduce((s, i) => s + (i.miles ? Number(i.miles) : 0), 0);
          return (
            <div key={r.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{r.user.name}</span>
                <span className="text-sm opacity-60">
                  {shortDate(r.periodStart)} – {shortDate(r.periodEnd)}
                </span>
                <span className="font-semibold">{money(total)}</span>
              </div>
              <p className="mt-1 text-sm opacity-70">
                {mine.filter((i) => i.kind === "out_of_pocket").length} out of pocket ·{" "}
                {mine.filter((i) => i.kind === "mileage").length} mileage
                {miles > 0 ? ` (${miles.toLocaleString()} mi)` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={approveReport}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
                    Approve
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
        })
      )}
    </div>
  );
}
