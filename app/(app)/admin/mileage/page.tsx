import { asc, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, mileageRates } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { inputClass, SaveButton, Section } from "../_ui";
import { deleteMileageRate, upsertMileageRate } from "../actions";

const GRID =
  "grid grid-cols-[10rem_5.5rem_5rem_minmax(8rem,1fr)_9rem] items-center gap-2";

export default async function AdminMileagePage() {
  await requireRole("admin");
  const [rows, usage] = await Promise.all([
    db.query.mileageRates.findMany({ orderBy: [asc(mileageRates.effectiveDate)] }),
    db
      .select({ rateId: expenseItems.mileageRateId, n: sql<number>`count(*)` })
      .from(expenseItems)
      .groupBy(expenseItems.mileageRateId),
  ]);
  const usedBy = new Map(usage.map((u) => [u.rateId, Number(u.n)]));

  return (
    <div className="space-y-8">
      <Section title="Add rate">
        <form action={upsertMileageRate} className="flex flex-wrap items-end gap-2">
          <input name="effectiveDate" type="date" required className={inputClass} />
          <input name="ratePerMile" required placeholder="0.7000" className={`${inputClass} w-24`} />
          <input name="source" defaultValue="IRS" className={`${inputClass} w-20`} />
          <input name="note" placeholder="note" className={inputClass} />
          <SaveButton label="Add" />
        </form>
        <p className="text-xs opacity-60">
          Dollars per mile. The newest rate effective on or before a trip date is used.
        </p>
      </Section>

      <Section title={`Rates (${rows.length})`}>
        <div className="overflow-x-auto">
          <div className="min-w-[40rem] space-y-1">
            <div className={`${GRID} px-1 text-xs font-medium uppercase tracking-wide opacity-50`}>
              <span>Effective</span>
              <span>$/mile</span>
              <span>Source</span>
              <span>Note</span>
              <span />
            </div>

            {rows.map((r) => {
              const inUse = usedBy.get(r.id) ?? 0;
              return (
                <form
                  key={r.id}
                  action={upsertMileageRate}
                  className={`${GRID} border-t border-black/10 py-1.5 dark:border-white/10`}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    name="effectiveDate"
                    type="date"
                    defaultValue={r.effectiveDate}
                    className={inputClass}
                  />
                  <input name="ratePerMile" defaultValue={r.ratePerMile} className={inputClass} />
                  <input name="source" defaultValue={r.source} className={inputClass} />
                  <input name="note" defaultValue={r.note ?? ""} className={inputClass} />
                  <div className="flex items-center gap-2">
                    <SaveButton />
                    {inUse > 0 ? (
                      <span
                        className="text-xs opacity-50"
                        title={`${inUse} mileage line(s) use this rate`}
                      >
                        in use · {inUse}
                      </span>
                    ) : (
                      <button
                        type="submit"
                        formAction={deleteMileageRate}
                        className="text-xs text-red-600 underline opacity-80 hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </form>
              );
            })}

            {rows.length === 0 && (
              <p className="px-1 py-2 text-sm opacity-60">No rates yet.</p>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
