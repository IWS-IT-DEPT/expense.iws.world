import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { jobs } from "@/db/schema";
import { dimensionBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { ChangeGuard, TypedDelete } from "../../_confirm";
import { DirtyForm } from "../../_dirty-form";
import { BackLink, DeleteSection, ErrorNote, Field, inputClass } from "../../_ui";
import { deleteJob, upsertJob } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function JobDetailPage({
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
  const j = await db.query.jobs.findFirst({ where: eq(jobs.id, id), with: { entity: true } });
  if (!j) notFound();
  const blockers = await dimensionBlockers("job", id);

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/admin/jobs" label="Jobs" />
        <h2 className="mt-2 text-lg font-semibold">
          {j.jobNumber}
          <span className="ml-2 text-sm font-normal opacity-60">
            {j.entity.code}
            {!j.active ? " · turned off" : ""}
          </span>
        </h2>
      </div>
      <ErrorNote error={sp.error} />

      <DirtyForm
        action={upsertJob}
        resetKey={[j.jobNumber, j.name, j.customerName, j.status, j.active].join("|")}
        className="space-y-4 text-sm"
      >
        <input type="hidden" name="id" value={j.id} />
        <ChangeGuard
          fields={[{ name: "jobNumber", label: "Job number", original: j.jobNumber, className: "w-full" }]}
          phrase={j.jobNumber}
          phraseLabel="the current job number"
          title="Changing this job number"
          bullets={[
            "It is a live label: every past and future expense, report and export shows the new number.",
            "Files already exported or emailed keep the old number, and anything outside the app that uses it will stop lining up.",
            "Coding and QuickBooks mappings are not affected — they follow the job, not the number.",
          ]}
        />
        <Field label="Entity" hint="Fixed — a job's QuickBooks mappings belong to its entity.">
          <p className="text-sm">{j.entity.code} · {j.entity.name}</p>
        </Field>
        <Field label="Job name">
          <input name="name" defaultValue={j.name ?? ""} className={`${inputClass} w-full`} />
        </Field>
        <Field label="Customer">
          <input name="customerName" defaultValue={j.customerName ?? ""} className={`${inputClass} w-full`} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={j.status} className={inputClass}>
            <option value="open">open</option>
            <option value="closed">closed</option>
          </select>
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={j.active} />
          <span>
            Active <span className="text-xs opacity-60">— untick to retire it from the dropdowns without deleting history</span>
          </span>
        </label>
      </DirtyForm>

      <DeleteSection what="job" blockers={blockers}>
        <TypedDelete
          id={j.id}
          phrase={`delete ${j.jobNumber}`}
          buttonLabel="I understand — delete this job"
          action={deleteJob}
          consequences={[
            <>
              <strong>{j.jobNumber}</strong> ({j.entity.code}) disappears from every list and dropdown, along with its
              QuickBooks mapping.
            </>,
            "Nothing uses it today, so no expenses are affected — but it can't be restored.",
            <>
              Not sure? <strong>Close it or turn it off instead</strong>.
            </>,
          ]}
        />
      </DeleteSection>
    </div>
  );
}
