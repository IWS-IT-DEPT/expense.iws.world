import { asc } from "drizzle-orm";

import { db } from "@/db";
import { jobs } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { ListHeader, RowLink, RowList } from "../_ui";

export default async function AdminJobsPage() {
  await requireRole("admin", "accounting");
  const rows = await db.query.jobs.findMany({ orderBy: [asc(jobs.jobNumber)], with: { entity: true } });

  return (
    <div className="space-y-4">
      <ListHeader
        title="Jobs"
        count={rows.length}
        blurb="Jobs that expenses are coded to. Click one to edit, close or delete it."
        addHref="/admin/jobs/new"
        addLabel="+ Add job"
      />
      <RowList empty="No jobs yet.">
        {rows.map((j) => (
          <RowLink key={j.id} href={`/admin/jobs/${j.id}`} off={!j.active}>
            <span className="font-medium">{j.jobNumber}</span>
            {j.name ? <span>{j.name}</span> : null}
            {j.customerName ? <span className="opacity-60">{j.customerName}</span> : null}
            <span className="text-xs opacity-60">
              {j.entity.code} · {j.status}
            </span>
          </RowLink>
        ))}
      </RowList>
    </div>
  );
}
