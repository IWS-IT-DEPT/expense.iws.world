import { asc } from "drizzle-orm";

import { db } from "@/db";
import { units } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { ListHeader, RowLink, RowList } from "../_ui";

export default async function AdminUnitsPage() {
  await requireRole("admin", "accounting");
  const rows = await db.query.units.findMany({ orderBy: [asc(units.unitNumber)], with: { entity: true } });

  return (
    <div className="space-y-4">
      <ListHeader
        title="Units"
        count={rows.length}
        blurb="Trucks, trailers and equipment that expenses are coded to. Click one to edit or delete it."
        addHref="/admin/units/new"
        addLabel="+ Add unit"
      />
      <RowList empty="No units yet.">
        {rows.map((u) => (
          <RowLink key={u.id} href={`/admin/units/${u.id}`} off={!u.active}>
            <span className="font-medium">{u.unitNumber}</span>
            {u.description ? <span className="opacity-60">{u.description}</span> : null}
            <span className="text-xs opacity-60">
              {u.type} · {u.entity.code}
            </span>
          </RowLink>
        ))}
      </RowList>
    </div>
  );
}
