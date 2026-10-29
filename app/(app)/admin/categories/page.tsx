import { asc } from "drizzle-orm";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { ListHeader, RowLink, RowList } from "../_ui";

export default async function AdminCategoriesPage() {
  await requireRole("admin", "accounting");
  const rows = await db.query.categories.findMany({ orderBy: [asc(categories.sortOrder), asc(categories.name)] });

  return (
    <div className="space-y-4">
      <ListHeader
        title="Categories"
        count={rows.length}
        blurb="The expense categories people pick from. Click one to edit or delete it."
        addHref="/admin/categories/new"
        addLabel="+ Add category"
      />
      <RowList empty="No categories yet.">
        {rows.map((c) => (
          <RowLink key={c.id} href={`/admin/categories/${c.id}`} off={!c.active}>
            <span className="font-mono">{c.code}</span>
            <span className="font-medium">{c.name}</span>
            <span className="text-xs opacity-60">
              {[c.requiresJobOrUnit ? "needs job/unit" : null, c.receiptAlwaysRequired ? "always receipt" : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </RowLink>
        ))}
      </RowList>
    </div>
  );
}
