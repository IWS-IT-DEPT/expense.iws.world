import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities, locations } from "@/db/schema";
import { usedLocationIds } from "@/lib/admin-usage";

import { DeleteCell, inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { deleteLocation, upsertLocation } from "../actions";

export default async function AdminLocationsPage() {
  const [rows, entityRows, used] = await Promise.all([
    db.query.locations.findMany({ orderBy: [asc(locations.name)] }),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
    usedLocationIds(),
  ]);

  const entityOptions = (selected?: string | null) => (
    <select name="homeEntityId" defaultValue={selected ?? ""} className={inputClass}>
      <option value="">— no home entity —</option>
      {entityRows.map((e) => (
        <option key={e.id} value={e.id}>
          {e.code}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <Section title="Add location">
        <form action={upsertLocation} className="flex flex-wrap items-end gap-2">
          <input name="code" required placeholder="CODE" className={`${inputClass} w-28`} />
          <input name="name" required placeholder="Name" className={inputClass} />
          {entityOptions()}
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
      </Section>

      <Section title={`Locations (${rows.length})`}>
        <Table head={["Code", "Name", "Home entity", "Active", ""]}>
          {rows.map((l) => (
            <Row key={l.id}>
              <td className="py-2 pr-3 font-mono">{l.code}</td>
              <td colSpan={4}>
                <form action={upsertLocation} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={l.id} />
                  <input name="code" defaultValue={l.code} className={`${inputClass} w-28`} />
                  <input name="name" defaultValue={l.name} className={inputClass} />
                  {entityOptions(l.homeEntityId)}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={l.active} /> active
                  </label>
                  <SaveButton />
                  <DeleteCell used={used.has(l.id)} action={deleteLocation} />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
