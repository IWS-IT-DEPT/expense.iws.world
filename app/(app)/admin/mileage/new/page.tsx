import { SubmitButton } from "@/app/components/submit-button";
import { requireRole } from "@/lib/current-user";

import { BackLink, ErrorNote, Field, inputClass } from "../../_ui";
import { upsertMileageRate } from "../../actions";

export default async function NewMileageRatePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin", "payroll");
  const sp = await searchParams;
  return (
    <div className="max-w-xl space-y-4">
      <BackLink href="/admin/mileage" label="Mileage rates" />
      <h2 className="text-base font-semibold">Add mileage rate</h2>
      <ErrorNote error={sp.error} />
      <form action={upsertMileageRate} className="space-y-4 text-sm">
        <Field label="Effective date" hint="Trips on or after this date use the rate, until a newer one starts.">
          <input name="effectiveDate" type="date" required className={inputClass} />
        </Field>
        <Field label="Dollars per mile" hint="e.g. 0.7000">
          <input name="ratePerMile" required inputMode="decimal" placeholder="0.7000" className={`${inputClass} w-28 font-mono`} />
        </Field>
        <Field label="Source">
          <input name="source" defaultValue="IRS" className={`${inputClass} w-32`} />
        </Field>
        <Field label="Note">
          <input name="note" className={`${inputClass} w-full`} />
        </Field>
        <SubmitButton
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add rate
        </SubmitButton>
      </form>
    </div>
  );
}
