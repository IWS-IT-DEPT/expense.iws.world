import { asc } from "drizzle-orm";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { usedCategoryIds } from "@/lib/admin-usage";

import { DeleteCell, inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { deleteCategory, upsertCategory } from "../actions";

export default async function AdminCategoriesPage() {
  const [rows, used] = await Promise.all([
    db.query.categories.findMany({ orderBy: [asc(categories.sortOrder)] }),
    usedCategoryIds(),
  ]);

  return (
    <div className="space-y-8">
      <Section title="Add category">
        <form action={upsertCategory} className="flex flex-wrap items-end gap-2">
          <input name="code" required placeholder="CODE" className={`${inputClass} w-28`} />
          <input name="name" required placeholder="Name" className={inputClass} />
          <input name="sortOrder" type="number" defaultValue={100} className={`${inputClass} w-20`} />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="requiresJobOrUnit" /> needs job/unit
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="receiptAlwaysRequired" /> always receipt
          </label>
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
      </Section>

      <Section title={`Categories (${rows.length})`}>
        <Table head={["Code", "Name", "Sort", "Job/unit", "Receipt", "Active", ""]}>
          {rows.map((c) => (
            <Row key={c.id}>
              <td className="py-2 pr-3 font-mono">{c.code}</td>
              <td colSpan={6}>
                <form action={upsertCategory} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="code" defaultValue={c.code} className={`${inputClass} w-28`} />
                  <input name="name" defaultValue={c.name} className={inputClass} />
                  <input name="sortOrder" type="number" defaultValue={c.sortOrder} className={`${inputClass} w-20`} />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="requiresJobOrUnit" defaultChecked={c.requiresJobOrUnit} /> job/unit
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="receiptAlwaysRequired" defaultChecked={c.receiptAlwaysRequired} /> receipt
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={c.active} /> active
                  </label>
                  <SaveButton />
                  <DeleteCell used={used.has(c.id)} action={deleteCategory} />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
