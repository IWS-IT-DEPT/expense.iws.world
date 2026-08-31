import { asc } from "drizzle-orm";

import { db } from "@/db";
import { mileageRates } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { upsertMileageRate } from "../actions";

export default async function AdminMileagePage() {
  const rows = await db.query.mileageRates.findMany({ orderBy: [asc(mileageRates.effectiveDate)] });

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

      <Section title="Rates">
        <Table head={["Effective", "$/mile", "Source", "Note", ""]}>
          {rows.map((r) => (
            <Row key={r.id}>
              <td colSpan={5}>
                <form action={upsertMileageRate} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="effectiveDate" type="date" defaultValue={r.effectiveDate} className={inputClass} />
                  <input name="ratePerMile" defaultValue={r.ratePerMile} className={`${inputClass} w-24`} />
                  <input name="source" defaultValue={r.source} className={`${inputClass} w-20`} />
                  <input name="note" defaultValue={r.note ?? ""} className={inputClass} />
                  <SaveButton />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
