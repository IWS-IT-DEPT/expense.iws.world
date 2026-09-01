import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";
import { approveCardExpenses, approveReport, sendBackCardExpense, sendBackReport } from "./actions";

export default async function ApprovalsPage() {
  await requireRole("approver", "admin");

  const [cardLines, reports] = await Promise.all([
    db.query.pendingExpenses.findMany({
      where: eq(pendingExpenses.status, "reconciled"),
      orderBy: [asc(pendingExpenses.purchaseDate)],
      with: {
        user: { columns: { id: true, name: true } },
        entity: true,
        category: true,
      },
    }),
    db.query.expenseReports.findMany({
      where: eq(expenseReports.status, "submitted"),
      orderBy: [asc(expenseReports.periodStart)],
      with: { user: { columns: { name: true } } },
    }),
  ]);

  const reportIds = reports.map((r) => r.id);
  const items = reportIds.length
    ? await db.query.expenseItems.findMany({ where: inArray(expenseItems.reportId, reportIds) })
    : [];

  // group card lines by user
  const byUser = new Map<string, { name: string; lines: typeof cardLines }>();
  for (const l of cardLines) {
    const u = byUser.get(l.user.id) ?? { name: l.user.name, lines: [] as typeof cardLines };
    u.lines.push(l);
    byUser.set(l.user.id, u);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Approvals</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Card charges — reconciled ({cardLines.length})
          </h2>
          {cardLines.length > 0 ? (
            <form action={approveCardExpenses}>
              <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
                Approve all {cardLines.length}
              </button>
            </form>
          ) : null}
        </div>

        {byUser.size === 0 ? (
          <p className="text-sm opacity-60">Nothing reconciled is waiting.</p>
        ) : (
          [...byUser.entries()].map(([uid, u]) => {
            const total = u.lines.reduce(
              (s, l) => s + (l.actualAmountCents ?? l.amountCents),
              0,
            );
            const corrected = u.lines.filter(
              (l) => l.actualAmountCents != null && l.actualAmountCents !== l.amountCents,
            ).length;
            return (
              <div key={uid} className="rounded-lg border border-black/10 dark:border-white/15">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 px-4 py-2 text-sm dark:border-white/15">
                  <span className="font-medium">{u.name}</span>
                  <span>
                    {u.lines.length} charge{u.lines.length > 1 ? "s" : ""}
                    {corrected > 0 ? ` · ${corrected} corrected` : ""}
                  </span>
                  <span className="font-semibold">{money(total)}</span>
                  <form action={approveCardExpenses}>
                    <input type="hidden" name="ids" value={u.lines.map((l) => l.id).join(",")} />
                    <button className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">
                      approve these
                    </button>
                  </form>
                </div>
                <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
                  {u.lines.map((l) => {
                    const posted = l.actualAmountCents ?? l.amountCents;
                    return (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                        <span>
                          {shortDate(l.actualPurchaseDate ?? l.purchaseDate)} · {l.merchant}
                        </span>
                        <span>
                          {money(posted)}
                          {posted !== l.amountCents ? (
                            <span className="opacity-50"> (was {money(l.amountCents)})</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-1.5 opacity-80">
                          {l.entity ? <EntityBadge code={l.entity.code} color={l.entity.brandColor} /> : null}
                          {l.category?.name}
                        </span>
                        <form action={sendBackCardExpense} className="flex gap-1">
                          <input type="hidden" name="id" value={l.id} />
                          <input
                            name="reason"
                            placeholder="send back…"
                            className="w-28 rounded border border-black/15 px-2 py-0.5 text-xs dark:border-white/20"
                          />
                          <button className="text-xs underline opacity-60">back</button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Reimbursement reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="text-sm opacity-60">No reimbursement reports waiting.</p>
        ) : (
          reports.map((r) => {
            const mine = items.filter((i) => i.reportId === r.id);
            const total = mine.reduce((s, i) => s + i.amountCents, 0);
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
      </section>
    </div>
  );
}
