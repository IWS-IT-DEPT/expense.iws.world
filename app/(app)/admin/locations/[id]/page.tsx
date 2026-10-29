import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { entities, locations } from "@/db/schema";
import { dimensionBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { ChangeGuard, TypedDelete } from "../../_confirm";
import { DirtyForm } from "../../_dirty-form";
import { BackLink, DeleteSection, ErrorNote, Field, inputClass } from "../../_ui";
import { deleteLocation, upsertLocation } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("admin", "accounting");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const l = await db.query.locations.findFirst({ where: eq(locations.id, id) });
  if (!l) notFound();
  const [blockers, ents] = await Promise.all([
    dimensionBlockers("location", id),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
  ]);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/admin/locations" label="Locations" />
        <h2 className="mt-2 text-lg font-semibold">
          <span className="font-mono">{l.code}</span> · {l.name}
          {!l.active ? <span className="ml-2 text-sm font-normal opacity-60">(turned off)</span> : null}
        </h2>
      </div>
      <ErrorNote error={sp.error} />

      <DirtyForm
        action={upsertLocation}
        resetKey={[l.code, l.name, l.homeEntityId, l.address, l.active].join("|")}
        className="space-y-4 text-sm"
      >
        <input type="hidden" name="id" value={l.id} />
        <ChangeGuard
          fields={[{ name: "code", label: "Code", original: l.code, maxLength: 24, className: "w-32 font-mono uppercase" }]}
          phrase={l.code}
          phraseLabel="the current code"
          title="Changing this code"
          bullets={[
            "The code is a live label: every past and future expense, report and export shows the new one.",
            "Files already exported or emailed keep the old code, and anything outside the app that uses it will stop lining up.",
            "Amounts, coding and QuickBooks mappings are not affected — they follow the location, not the code.",
          ]}
        />
        <Field label="Name">
          <input name="name" defaultValue={l.name} required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Home entity">
          <select name="homeEntityId" defaultValue={l.homeEntityId ?? ""} className={inputClass}>
            <option value="">— none —</option>
            {ents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Address"
          hint={
            l.latitude
              ? "Found on the map. Mileage stops within about 250 m are named after this site."
              : "Optional. Add the full street address (with city and state) so mileage stops here are named after the site."
          }
        >
          <input name="address" defaultValue={l.address ?? ""} className={`${inputClass} w-full`} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={l.active} />
          <span>
            Active <span className="text-xs opacity-60">— untick to hide it from the dropdowns without deleting history</span>
          </span>
        </label>
      </DirtyForm>

      <DeleteSection what="location" blockers={blockers}>
        <TypedDelete
          id={l.id}
          phrase={`delete ${l.code}`}
          buttonLabel="I understand — delete this location"
          action={deleteLocation}
          consequences={[
            <>
              <strong>
                {l.code} · {l.name}
              </strong>{" "}
              disappears from every list and dropdown, along with its QuickBooks location mappings.
            </>,
            "Nothing uses it today, so no expenses are affected — but it can't be restored.",
            <>
              Not sure? <strong>Turn it off instead</strong> (untick Active above).
            </>,
          ]}
        />
      </DeleteSection>
    </div>
  );
}
