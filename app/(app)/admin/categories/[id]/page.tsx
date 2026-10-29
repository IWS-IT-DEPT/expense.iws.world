import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { dimensionBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { ChangeGuard, TypedDelete } from "../../_confirm";
import { DirtyForm } from "../../_dirty-form";
import { BackLink, DeleteSection, ErrorNote, Field, inputClass } from "../../_ui";
import { deleteCategory, upsertCategory } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function CategoryDetailPage({
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
  const c = await db.query.categories.findFirst({ where: eq(categories.id, id) });
  if (!c) notFound();
  const blockers = await dimensionBlockers("category", id);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/admin/categories" label="Categories" />
        <h2 className="mt-2 text-lg font-semibold">
          <span className="font-mono">{c.code}</span> · {c.name}
          {!c.active ? <span className="ml-2 text-sm font-normal opacity-60">(turned off)</span> : null}
        </h2>
      </div>
      <ErrorNote error={sp.error} />

      <DirtyForm
        action={upsertCategory}
        resetKey={[c.code, c.name, c.description, c.sortOrder, c.requiresJobOrUnit, c.receiptAlwaysRequired, c.active].join("|")}
        className="space-y-4 text-sm"
      >
        <input type="hidden" name="id" value={c.id} />
        <ChangeGuard
          fields={[{ name: "code", label: "Code", original: c.code, maxLength: 24, className: "w-40 font-mono uppercase" }]}
          phrase={c.code}
          phraseLabel="the current code"
          title="Changing this code"
          bullets={[
            "The code is a live label: every past and future expense, report and export shows the new one.",
            "Files already exported or emailed keep the old code, and anything outside the app that uses it will stop lining up.",
            "Amounts, coding and QuickBooks account mappings are not affected — they follow the category, not the code.",
          ]}
        />
        <Field label="Name">
          <input name="name" defaultValue={c.name} required className={`${inputClass} w-full`} />
        </Field>
        <Field label="Description">
          <input name="description" defaultValue={c.description ?? ""} className={`${inputClass} w-full`} />
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first in dropdowns.">
          <input name="sortOrder" type="number" defaultValue={c.sortOrder} className={`${inputClass} w-24`} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requiresJobOrUnit" defaultChecked={c.requiresJobOrUnit} /> Needs a job or unit
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="receiptAlwaysRequired" defaultChecked={c.receiptAlwaysRequired} /> A receipt is
          always required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={c.active} />
          <span>
            Active <span className="text-xs opacity-60">— untick to retire it from the dropdowns without deleting history</span>
          </span>
        </label>
      </DirtyForm>

      <DeleteSection what="category" blockers={blockers}>
        <TypedDelete
          id={c.id}
          phrase={`delete ${c.code}`}
          buttonLabel="I understand — delete this category"
          action={deleteCategory}
          consequences={[
            <>
              <strong>
                {c.code} · {c.name}
              </strong>{" "}
              disappears from every list and dropdown, along with its QuickBooks account mappings.
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
