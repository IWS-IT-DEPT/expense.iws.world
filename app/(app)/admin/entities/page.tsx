import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { updateEntity } from "../actions";

const modes = ["none", "unit", "job", "unit_or_job"] as const;

export default async function AdminEntitiesPage() {
  const rows = await db.query.entities.findMany({
    orderBy: [asc(entities.code)],
    with: { qboConnection: true },
  });

  return (
    <Section title="Entities">
      <p className="text-xs opacity-60">
        The 6 sister companies. `costingMode` decides whether the coding wizard forces a unit or a
        job. Each connects to its own QuickBooks Online file.
      </p>
      <Table head={["Code", "Name / legal", "Costing", "Colour", "Active", ""]}>
        {rows.map((e) => (
          <Row key={e.id}>
            <td className="py-2 pr-3 font-mono">{e.code}</td>
            <td colSpan={6}>
              <form action={updateEntity} className="flex flex-wrap items-center gap-2 py-1">
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
                <span className="text-xs opacity-50">
                  QBO: {e.qboConnection?.status ?? "disconnected"}
                </span>
              </form>
            </td>
          </Row>
        ))}
      </Table>
    </Section>
  );
}
