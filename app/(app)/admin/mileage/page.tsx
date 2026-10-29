import { desc } from "drizzle-orm";

import { db } from "@/db";
import { mileageRates } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { ListHeader, RowLink, RowList } from "../_ui";

export default async function AdminMileagePage() {
  await requireRole("admin", "payroll");
  const rows = await db.query.mileageRates.findMany({ orderBy: [desc(mileageRates.effectiveDate)] });

  return (
    <div className="space-y-4">
      <ListHeader
        title="Mileage rates"
        count={rows.length}
        blurb="Dollars per mile. The newest rate effective on or before a trip's date is used. Click one to edit or delete it."
        addHref="/admin/mileage/new"
        addLabel="+ Add rate"
      />
      <RowList empty="No rates yet.">
        {rows.map((r) => (
          <RowLink key={r.id} href={`/admin/mileage/${r.id}`}>
            <span className="font-medium">From {r.effectiveDate}</span>
            <span className="font-mono">${Number(r.ratePerMile).toFixed(4)}/mile</span>
            <span className="text-xs opacity-60">{r.source}</span>
            {r.note ? <span className="opacity-60">{r.note}</span> : null}
          </RowLink>
        ))}
      </RowList>
    </div>
  );
}
