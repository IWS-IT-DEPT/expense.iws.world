import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities, jobs } from "@/db/schema";
import { usedJobIds } from "@/lib/admin-usage";

import { DeleteCell, inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { deleteJob, upsertJob } from "../actions";

export default async function AdminJobsPage() {
  const [rows, entityRows, used] = await Promise.all([
    db.query.jobs.findMany({ orderBy: [asc(jobs.jobNumber)], with: { entity: true } }),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
    usedJobIds(),
  ]);

  const entitySelect = (selected?: string) => (
    <select name="entityId" required defaultValue={selected ?? ""} className={inputClass}>
      <option value="">entity…</option>
      {entityRows.map((e) => (
        <option key={e.id} value={e.id}>
          {e.code}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <Section title="Add job">
        <form action={upsertJob} className="flex flex-wrap items-end gap-2">
          {entitySelect()}
          <input name="jobNumber" required placeholder="J24-118" className={inputClass} />
          <input name="name" placeholder="job name" className={inputClass} />
          <input name="customerName" placeholder="customer" className={inputClass} />
          <input type="hidden" name="status" value="open" />
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
      </Section>

      <Section title={`Jobs (${rows.length})`}>
        <Table head={["Entity", "Job #", "Name", "Customer", "Status", "Active", ""]}>
          {rows.map((j) => (
            <Row key={j.id}>
              <td colSpan={7}>
                <form action={upsertJob} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={j.id} />
                  {entitySelect(j.entityId)}
                  <input name="jobNumber" defaultValue={j.jobNumber} className={inputClass} />
                  <input name="name" defaultValue={j.name ?? ""} className={inputClass} />
                  <input name="customerName" defaultValue={j.customerName ?? ""} className={inputClass} />
                  <select name="status" defaultValue={j.status} className={inputClass}>
                    <option value="open">open</option>
                    <option value="closed">closed</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={j.active} /> active
                  </label>
                  <SaveButton />
                  <DeleteCell used={used.has(j.id)} action={deleteJob} />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
