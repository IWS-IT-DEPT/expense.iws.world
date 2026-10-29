import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mileageRates } from "@/db/schema";
import { dimensionBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { ChangeGuard, TypedDelete } from "../../_confirm";
import { DirtyForm } from "../../_dirty-form";
import { BackLink, DeleteSection, ErrorNote, Field, inputClass } from "../../_ui";
import { deleteMileageRate, upsertMileageRate } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function MileageRateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("admin", "payroll");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const r = await db.query.mileageRates.findFirst({ where: eq(mileageRates.id, id) });
  if (!r) notFound();
  const blockers = await dimensionBlockers("mileage", id);
  const rate = Number(r.ratePerMile).toFixed(4);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/admin/mileage" label="Mileage rates" />
        <h2 className="mt-2 text-lg font-semibold">
          ${rate}/mile <span className="text-sm font-normal opacity-60">from {r.effectiveDate}</span>
        </h2>
      </div>
      <ErrorNote error={sp.error} />

      <DirtyForm
        action={upsertMileageRate}
        resetKey={[r.effectiveDate, rate, r.source, r.note].join("|")}
        className="space-y-4 text-sm"
      >
        <input type="hidden" name="id" value={r.id} />
        <ChangeGuard
          fields={[
            { name: "effectiveDate", label: "Effective date", original: r.effectiveDate, type: "date", className: "w-44" },
            { name: "ratePerMile", label: "Dollars per mile", original: rate, inputMode: "decimal", className: "w-28 font-mono" },
          ]}
          phrase="change rate"
          phraseLabel=""
          title="Changing the date or amount of this rate"
          bullets={[
            "Mileage lines already saved keep the amount they were calculated with — they are not recalculated.",
            "Trips entered from now on use the new date and amount, and a different date can switch which rate applies to a trip.",
            "Prefer adding a new rate with its own effective date when the IRS rate changes.",
          ]}
        />
        <Field label="Source">
          <input name="source" defaultValue={r.source} className={`${inputClass} w-32`} />
        </Field>
        <Field label="Note">
          <input name="note" defaultValue={r.note ?? ""} className={`${inputClass} w-full`} />
        </Field>
      </DirtyForm>

      <DeleteSection what="rate" blockers={blockers}>
        <TypedDelete
          id={r.id}
          phrase={`delete ${r.effectiveDate}`}
          buttonLabel="I understand — delete this rate"
          action={deleteMileageRate}
          consequences={[
            <>
              The ${rate}/mile rate starting <strong>{r.effectiveDate}</strong> is erased.
            </>,
            "Trips dated in its period will use the previous rate — or can't be logged at all if no earlier rate exists.",
            "No saved mileage line uses it, so nothing already logged changes.",
          ]}
        />
      </DeleteSection>
    </div>
  );
}
