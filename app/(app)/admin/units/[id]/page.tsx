import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { units } from "@/db/schema";
import { dimensionBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { ChangeGuard, TypedDelete } from "../../_confirm";
import { DirtyForm } from "../../_dirty-form";
import { BackLink, DeleteSection, ErrorNote, Field, inputClass } from "../../_ui";
import { deleteUnit, upsertUnit } from "../../actions";
import { UNIT_TYPES } from "../unit-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function UnitDetailPage({
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
  const u = await db.query.units.findFirst({ where: eq(units.id, id), with: { entity: true } });
  if (!u) notFound();
  const blockers = await dimensionBlockers("unit", id);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/admin/units" label="Units" />
        <h2 className="mt-2 text-lg font-semibold">
          {u.unitNumber}
          <span className="ml-2 text-sm font-normal opacity-60">
            {u.entity.code}
            {!u.active ? " · turned off" : ""}
          </span>
        </h2>
      </div>
      <ErrorNote error={sp.error} />

      <DirtyForm
        action={upsertUnit}
        resetKey={[u.unitNumber, u.description, u.type, u.active].join("|")}
        className="space-y-4 text-sm"
      >
        <input type="hidden" name="id" value={u.id} />
        <ChangeGuard
          fields={[{ name: "unitNumber", label: "Unit number", original: u.unitNumber, className: "w-full" }]}
          phrase={u.unitNumber}
          phraseLabel="the current unit number"
          title="Changing this unit number"
          bullets={[
            "It is a live label: every past and future expense, report and export shows the new number.",
            "Files already exported or emailed keep the old number, and anything outside the app that uses it will stop lining up.",
            "Coding and QuickBooks class mappings are not affected — they follow the unit, not the number.",
          ]}
        />
        <Field label="Entity" hint="Fixed — a unit's QuickBooks mappings belong to its entity.">
          <p className="text-sm">{u.entity.code} · {u.entity.name}</p>
        </Field>
        <Field label="Description">
          <input name="description" defaultValue={u.description ?? ""} className={`${inputClass} w-full`} />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={u.type} className={inputClass}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={u.active} />
          <span>
            Active <span className="text-xs opacity-60">— untick to retire it from the dropdowns without deleting history</span>
          </span>
        </label>
      </DirtyForm>

      <DeleteSection what="unit" blockers={blockers}>
        <TypedDelete
          id={u.id}
          phrase={`delete ${u.unitNumber}`}
          buttonLabel="I understand — delete this unit"
          action={deleteUnit}
          consequences={[
            <>
              <strong>{u.unitNumber}</strong> ({u.entity.code}) disappears from every list and dropdown, along with its
              QuickBooks class mapping.
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
