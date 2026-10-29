import { asc } from "drizzle-orm";

import { SubmitButton } from "@/app/components/submit-button";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { BackLink, ErrorNote, Field, inputClass } from "../../_ui";
import { upsertUnit } from "../../actions";
import { UNIT_TYPES } from "../unit-types";

export default async function NewUnitPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin", "accounting");
  const sp = await searchParams;
  const ents = await db.query.entities.findMany({ orderBy: [asc(entities.code)] });
  return (
    <div className="max-w-xl space-y-4">
      <BackLink href="/admin/units" label="Units" />
      <h2 className="text-base font-semibold">Add unit</h2>
      <ErrorNote error={sp.error} />
      <form action={upsertUnit} className="space-y-4 text-sm">
        <input type="hidden" name="active" value="on" />
        <Field label="Entity" hint="Which company owns it. This can't be changed later.">
          <select name="entityId" required defaultValue="" className={inputClass}>
            <option value="">choose…</option>
            {ents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit number" hint="As people will see it, e.g. Truck 07.">
          <input name="unitNumber" required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Description">
          <input name="description" className={`${inputClass} w-full`} />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue="truck" className={inputClass}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <SubmitButton
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add unit
        </SubmitButton>
      </form>
    </div>
  );
}
