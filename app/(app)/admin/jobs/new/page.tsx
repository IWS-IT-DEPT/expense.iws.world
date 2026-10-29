import { asc } from "drizzle-orm";

import { SubmitButton } from "@/app/components/submit-button";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { BackLink, ErrorNote, Field, inputClass } from "../../_ui";
import { upsertJob } from "../../actions";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin", "accounting");
  const sp = await searchParams;
  const ents = await db.query.entities.findMany({ orderBy: [asc(entities.code)] });
  return (
    <div className="max-w-xl space-y-4">
      <BackLink href="/admin/jobs" label="Jobs" />
      <h2 className="text-base font-semibold">Add job</h2>
      <ErrorNote error={sp.error} />
      <form action={upsertJob} className="space-y-4 text-sm">
        <input type="hidden" name="active" value="on" />
        <input type="hidden" name="status" value="open" />
        <Field label="Entity" hint="Which company the job belongs to. This can't be changed later.">
          <select name="entityId" required defaultValue="" className={inputClass}>
            <option value="">choose…</option>
            {ents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Job number" hint="e.g. J24-118.">
          <input name="jobNumber" required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Job name">
          <input name="name" className={`${inputClass} w-full`} />
        </Field>
        <Field label="Customer">
          <input name="customerName" className={`${inputClass} w-full`} />
        </Field>
        <SubmitButton
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add job
        </SubmitButton>
      </form>
    </div>
  );
}
