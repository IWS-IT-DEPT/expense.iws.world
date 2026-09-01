import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";
import { approveCardExpenses, sendBackCardExpense } from "./actions";

export default async function ApprovalsPage() {
  await requireRole("approver", "admin");

  const cardLines = await db.query.pendingExpenses.findMany({
    where: eq(pendingExpenses.status, "reconciled"),
    orderBy: [asc(pendingExpenses.purchaseDate)],
    with: {
      user: { columns: { id: true, name: true } },
      entity: true,
      category: true,
    },
  });

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

      <p className="text-xs opacity-60">
        Mileage and out-of-pocket reimbursements are reconciled and approved by payroll.
      </p>
    </div>
  );
}
