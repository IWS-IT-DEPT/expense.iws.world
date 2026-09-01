import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities } from "@/db/schema";
import { usedEntityIds } from "@/lib/admin-usage";

import { DeleteCell, inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { deleteEntity, upsertEntity } from "../actions";

const modes = ["none", "unit", "job", "unit_or_job"] as const;

export default async function AdminEntitiesPage() {
  const [rows, used] = await Promise.all([
    db.query.entities.findMany({
      orderBy: [asc(entities.code)],
      with: { qboConnection: true },
    }),
    usedEntityIds(),
  ]);

  return (
    <div className="space-y-8">
      <Section title="Add entity">
        <form action={upsertEntity} className="flex flex-wrap items-end gap-2">
          <input name="code" required placeholder="CODE" className={`${inputClass} w-24`} />
          <input name="name" required placeholder="Name" className={inputClass} />
          <input name="legalName" placeholder="legal name" className={inputClass} />
          <select name="costingMode" defaultValue="none" className={inputClass}>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input name="brandColor" placeholder="#2F9E5A" className={`${inputClass} w-24`} />
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
        <p className="text-xs opacity-60">
          A new entity has no QuickBooks connection until IT sets one up on the Overview tab.
        </p>
      </Section>

      <Section title={`Entities (${rows.length})`}>
        <p className="text-xs opacity-60">
          The sister companies. `costingMode` decides whether the coding wizard forces a unit or a
          job. `code` is fixed once created. Delete is available only while nothing references the
          entity — otherwise uncheck `active` to retire it.
        </p>
        <Table head={["Code", "Name / legal", "Costing", "Colour", "Active", ""]}>
          {rows.map((e) => (
            <Row key={e.id}>
              <td className="py-2 pr-3 font-mono">{e.code}</td>
              <td colSpan={6}>
                <form action={upsertEntity} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={e.id} />
                  <input name="name" defaultValue={e.name} className={inputClass} />
                  <input name="legalName" defaultValue={e.legalName ?? ""} placeholder="legal name" className={inputClass} />
                  <select name="costingMode" defaultValue={e.costingMode} className={inputClass}>
                    {modes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input name="brandColor" defaultValue={e.brandColor ?? ""} placeholder="#2F9E5A" className={`${inputClass} w-24`} />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={e.active} /> active
                  </label>
                  <SaveButton />
                  <DeleteCell used={used.has(e.id)} action={deleteEntity} />
                  <span className="text-xs opacity-50">
                    QBO: {e.qboConnection?.status ?? "disconnected"}
                  </span>
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
