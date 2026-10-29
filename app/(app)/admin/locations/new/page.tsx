import { asc } from "drizzle-orm";

import { SubmitButton } from "@/app/components/submit-button";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { BackLink, ErrorNote, Field, inputClass } from "../../_ui";
import { upsertLocation } from "../../actions";

export default async function NewLocationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin", "accounting");
  const sp = await searchParams;
  const ents = await db.query.entities.findMany({ orderBy: [asc(entities.code)] });
  return (
    <div className="max-w-xl space-y-4">
      <BackLink href="/admin/locations" label="Locations" />
      <h2 className="text-base font-semibold">Add location</h2>
      <ErrorNote error={sp.error} />
      <form action={upsertLocation} className="space-y-4 text-sm">
        <input type="hidden" name="active" value="on" />
        <Field label="Code" hint="Short label shown on reports, e.g. HOU. Letters, digits, - or _.">
          <input name="code" required maxLength={24} className={`${inputClass} w-32 font-mono uppercase`} />
        </Field>
        <Field label="Name">
          <input name="name" required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Home entity" hint="Optional — the company that normally runs this site.">
          <select name="homeEntityId" defaultValue="" className={inputClass}>
            <option value="">— none —</option>
            {ents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.name}
              </option>
            ))}
          </select>
        </Field>
        <SubmitButton
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add location
        </SubmitButton>
      </form>
    </div>
  );
}
