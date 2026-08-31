import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities, units } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { upsertUnit } from "../actions";

const types = ["truck", "tractor", "trailer", "equipment", "other"] as const;

export default async function AdminUnitsPage() {
  const [rows, entityRows] = await Promise.all([
    db.query.units.findMany({ orderBy: [asc(units.unitNumber)], with: { entity: true } }),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
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
  const typeSelect = (selected?: string) => (
    <select name="type" defaultValue={selected ?? "truck"} className={inputClass}>
      {types.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <Section title="Add unit">
        <form action={upsertUnit} className="flex flex-wrap items-end gap-2">
          {entitySelect()}
          <input name="unitNumber" required placeholder="Truck 07" className={inputClass} />
          <input name="description" placeholder="description" className={inputClass} />
          {typeSelect()}
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
      </Section>

      <Section title={`Units (${rows.length})`}>
        <Table head={["Entity", "Unit #", "Description", "Type", "Active", ""]}>
          {rows.map((u) => (
            <Row key={u.id}>
              <td colSpan={6}>
                <form action={upsertUnit} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={u.id} />
                  {entitySelect(u.entityId)}
                  <input name="unitNumber" defaultValue={u.unitNumber} className={inputClass} />
                  <input name="description" defaultValue={u.description ?? ""} className={inputClass} />
                  {typeSelect(u.type)}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={u.active} /> active
                  </label>
                  <SaveButton />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
