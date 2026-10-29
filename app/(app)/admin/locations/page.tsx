import { asc } from "drizzle-orm";

import { db } from "@/db";
import { locations } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { ListHeader, RowLink, RowList } from "../_ui";

export default async function AdminLocationsPage() {
  await requireRole("admin", "accounting");
  const rows = await db.query.locations.findMany({ orderBy: [asc(locations.name)], with: { homeEntity: true } });

  return (
    <div className="space-y-4">
      <ListHeader
        title="Locations"
        count={rows.length}
        blurb="Sites and offices that expenses are coded to. Click one to edit or delete it."
        addHref="/admin/locations/new"
        addLabel="+ Add location"
      />
      <RowList empty="No locations yet.">
        {rows.map((l) => (
          <RowLink key={l.id} href={`/admin/locations/${l.id}`} off={!l.active}>
            <span className="font-mono">{l.code}</span>
            <span className="font-medium">{l.name}</span>
            {l.homeEntity ? <span className="opacity-60">{l.homeEntity.code}</span> : null}
          </RowLink>
        ))}
      </RowList>
    </div>
  );
}
