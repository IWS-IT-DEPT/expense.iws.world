import { SubmitButton } from "@/app/components/submit-button";
import { requireRole } from "@/lib/current-user";

import { BackLink, ErrorNote, Field, inputClass } from "../../_ui";
import { upsertCategory } from "../../actions";

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin", "accounting");
  const sp = await searchParams;
  return (
    <div className="max-w-xl space-y-4">
      <BackLink href="/admin/categories" label="Categories" />
      <h2 className="text-base font-semibold">Add category</h2>
      <ErrorNote error={sp.error} />
      <form action={upsertCategory} className="space-y-4 text-sm">
        <input type="hidden" name="active" value="on" />
        <Field label="Code" hint="Short label shown on reports, e.g. FUEL.">
          <input name="code" required maxLength={24} className={`${inputClass} w-40 font-mono uppercase`} />
        </Field>
        <Field label="Name">
          <input name="name" required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Description">
          <input name="description" className={`${inputClass} w-full`} />
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first in dropdowns.">
          <input name="sortOrder" type="number" defaultValue={100} className={`${inputClass} w-24`} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requiresJobOrUnit" /> Needs a job or unit
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="receiptAlwaysRequired" /> A receipt is always required
        </label>
        <SubmitButton
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add category
        </SubmitButton>
      </form>
    </div>
  );
}
