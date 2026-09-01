import { asc, eq } from "drizzle-orm";

import { EntityBadge } from "@/app/components/entity-badge";
import { db } from "@/db";
import { expenseItems } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { reconcileItems } from "../actions";
import { ItemReconcileActions } from "../reconcile-actions";

type Rec = { id: string; contentType: string };

function ReceiptStrip({ receipts }: { receipts: Rec[] }) {
  if (receipts.length === 0) {
    return <span className="text-xs text-amber-600 dark:text-amber-400">no receipt</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {receipts.map((r) => (
        <a key={r.id} href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">
          {r.contentType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/receipts/${r.id}`}
              alt="receipt"
              className="h-16 w-12 rounded border border-black/10 object-cover dark:border-white/15"
            />
          ) : (
            <span className="flex h-16 w-12 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15">
              PDF
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

export default async function PayrollReconcilePage() {
  await requireRole("payroll", "admin");

  const items = await db.query.expenseItems.findMany({
    where: eq(expenseItems.status, "submitted"),
    orderBy: [asc(expenseItems.itemDate)],
    with: {
      user: { columns: { id: true, name: true } },
      entity: true,
      category: true,
      receipts: { columns: { id: true, contentType: true } },
    },
  });

  const byUser = new Map<string, { name: string; lines: typeof items }>();
  for (const i of items) {
    const u = byUser.get(i.user.id) ?? { name: i.user.name, lines: [] as typeof items };
    u.lines.push(i);
    byUser.set(i.user.id, u);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Reconcile</h1>
        <p className="text-sm opacity-70">
          Submitted mileage and out-of-pocket lines. Check the receipt / trip against the coding and
          amount, then confirm each — or send it back to the employee.
        </p>
      </div>

      {byUser.size === 0 ? (
        <p className="text-sm opacity-60">Nothing to reconcile right now.</p>
      ) : (
        [...byUser.entries()].map(([uid, u]) => {
          const total = u.lines.reduce((s, l) => s + l.amountCents, 0);
          return (
            <div key={uid} className="rounded-lg border border-black/10 dark:border-white/15">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 px-4 py-2 text-sm dark:border-white/15">
                <span className="font-medium">{u.name}</span>
                <span>
                  {u.lines.length} line{u.lines.length > 1 ? "s" : ""} ·{" "}
                  {u.lines.filter((l) => l.kind === "out_of_pocket").length} OOP ·{" "}
                  {u.lines.filter((l) => l.kind === "mileage").length} mileage
                </span>
                <span className="font-semibold">{money(total)}</span>
                <form action={reconcileItems}>
                  <input type="hidden" name="ids" value={u.lines.map((l) => l.id).join(",")} />
                  <button className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">
                    confirm all {u.lines.length}
                  </button>
                </form>
              </div>
              <ul className="divide-y divide-black/5 dark:divide-white/10">
                {u.lines.map((i) => (
                  <li key={i.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{shortDate(i.itemDate)}</span>
                      <span>
                        {i.kind === "mileage"
                          ? `Mileage · ${i.miles ?? "?"} mi${
                              i.tripFrom || i.tripTo
                                ? ` · ${i.tripFrom ?? "?"} → ${i.tripTo ?? "?"}`
                                : ""
                            }`
                          : "Out of pocket"}
                      </span>
                      <span className="font-semibold">{money(i.amountCents)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 opacity-80">
                      {i.entity ? <EntityBadge code={i.entity.code} color={i.entity.brandColor} /> : null}
                      {i.category?.name}
                      {i.businessPurpose ? ` — ${i.businessPurpose}` : ""}
                    </div>
                    {i.kind !== "mileage" && (
                      <div className="mt-2">
                        <ReceiptStrip receipts={i.receipts} />
                      </div>
                    )}
                    <ItemReconcileActions itemId={i.id} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
