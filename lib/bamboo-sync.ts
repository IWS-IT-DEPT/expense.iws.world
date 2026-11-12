import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, receipts } from "@/db/schema";

import {
  BambooError,
  addBambooTableRow,
  bambooConfigured,
  bambooReceiptsCategoryId,
  fieldAlias,
  getBambooTableFields,
  uploadBambooEmployeeFile,
  type BambooTableField,
} from "./bamboohr";
import { blobStore } from "./storage";

/**
 * Records an APPROVED reimbursement report on the employee's BambooHR record:
 * a row per line in the custom expense / mileage table, plus the receipt files in
 * the "Receipts & Reimbursements" Documents folder. App → Bamboo only; the app stays
 * the source of truth. Idempotent: rows/files already sent are skipped, so a retry
 * after a partial failure never duplicates anything.
 *
 * Bamboo field names this expects (create them in Bamboo; any missing one is folded
 * into the free-text field instead so nothing is lost):
 *   Expense table  "customExpenseTracking":      Date, Category, Note, Finance Approval, Amount, Report ID
 *   Mileage table  "customMileageReimbursement": Date, Destination, Approval, Miles, Amount, Report ID,
 *                                                Allowance (per Mile)
 */

const EXPENSE_TABLE = "customExpenseTracking";
const MILEAGE_TABLE = "customMileageReimbursement";
const APPROVED = "Approved";

export interface SyncSummary {
  rows: number;
  files: number;
  failed: number;
  skipped?: string;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Set `values[name]` when the Bamboo field exists; otherwise return false so the caller can fold it into text. */
function put(
  fields: BambooTableField[],
  values: Record<string, string>,
  name: string,
  value: string | null | undefined,
): boolean {
  const alias = fieldAlias(fields, name);
  if (!alias) return false;
  if (value != null && value !== "") values[alias] = value;
  return true;
}

export async function syncReportToBamboo(reportId: string): Promise<SyncSummary> {
  const summary: SyncSummary = { rows: 0, files: 0, failed: 0 };
  if (!bambooConfigured) return { ...summary, skipped: "BambooHR isn't configured" };

  const items = await db.query.expenseItems.findMany({
    where: and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "approved")),
    with: { user: true, category: true, receipts: true },
  });
  if (items.length === 0) return { ...summary, skipped: "no approved lines" };

  const employeeId = items[0].user.bambooEmployeeId;
  if (!employeeId) {
    await db
      .update(expenseItems)
      .set({ bambooSyncError: "Not linked to a BambooHR employee" })
      .where(and(eq(expenseItems.reportId, reportId), isNull(expenseItems.bambooRowId)));
    return { ...summary, skipped: "user isn't linked to BambooHR" };
  }

  const [expenseFields, mileageFields] = await Promise.all([
    getBambooTableFields(EXPENSE_TABLE),
    getBambooTableFields(MILEAGE_TABLE),
  ]);
  const ref = reportId.slice(0, 8);

  for (const item of items) {
    try {
      if (!item.bambooRowId) {
        const mileage = item.kind === "mileage";
        const fields = mileage ? mileageFields : expenseFields;
        if (fields.length === 0) throw new BambooError(`${mileage ? MILEAGE_TABLE : EXPENSE_TABLE} table not found`);

        const base: Record<string, string> = {};
        const extra: string[] = []; // anything without its own Bamboo field goes into free text
        put(fields, base, "Date", item.itemDate);
        if (!put(fields, base, "Amount", dollars(item.amountCents))) extra.push(`Amount $${dollars(item.amountCents)}`);
        if (!put(fields, base, "Report ID", ref)) extra.push(`Report ${ref}`);

        // List fields (dropdowns) are tried first, then dropped if Bamboo won't take the value.
        const lists: Record<string, string> = {};
        let text: string;

        if (mileage) {
          const miles = item.miles ? Number(item.miles) : 0;
          // Bamboo's Miles field may be whole-number only; send it rounded and keep the exact figure in the text.
          const milesType = fields.find((f) => f.name.toLowerCase() === "miles")?.type;
          const milesValue = milesType === "int" ? String(Math.round(miles)) : String(miles);
          if (!put(fields, base, "Miles", miles ? milesValue : null) || (milesType === "int" && miles % 1 !== 0)) {
            extra.push(`${miles} mi`);
          }
          if (miles > 0) put(fields, base, "Allowance (per Mile)", (item.amountCents / 100 / miles).toFixed(4));
          const route = [item.tripFrom, item.tripTo].filter(Boolean).join(" → ");
          text = [route, item.businessPurpose, ...extra].filter(Boolean).join(" · ");
          put(fields, base, "Destination", text);
          put(fields, lists, "Approval", APPROVED);
        } else {
          text = [item.businessPurpose, item.paymentMethod?.replace(/_/g, " "), ...extra].filter(Boolean).join(" · ");
          put(fields, base, "Note", text);
          put(fields, lists, "Category", item.category.name);
          put(fields, lists, "Finance Approval", APPROVED);
        }

        const table = mileage ? MILEAGE_TABLE : EXPENSE_TABLE;
        let rowId: string;
        try {
          rowId = await addBambooTableRow(employeeId, table, { ...base, ...lists });
        } catch (err) {
          // Most likely a dropdown value Bamboo doesn't have: keep the data, drop the dropdowns.
          if (!(err instanceof BambooError) || err.status !== 400 || Object.keys(lists).length === 0) throw err;
          const fallbackText = [text, mileage ? "" : `Category: ${item.category.name}`, "Approved"].filter(Boolean).join(" · ");
          const noLists = { ...base };
          const textField = fieldAlias(fields, mileage ? "Destination" : "Note");
          if (textField) noLists[textField] = fallbackText;
          rowId = await addBambooTableRow(employeeId, table, noLists);
        }

        await db
          .update(expenseItems)
          .set({ bambooRowId: rowId, bambooSyncedAt: new Date(), bambooSyncError: null })
          .where(eq(expenseItems.id, item.id));
        summary.rows++;
      }

      if (bambooReceiptsCategoryId) {
        for (const r of item.receipts.filter((x) => !x.bambooFileId)) {
          const blob = await blobStore.get(r.blobKey);
          if (!blob) continue;
          const name = `${item.itemDate}_${item.kind === "mileage" ? "Mileage" : "Expense"}_${ref}_${r.filename}`.replace(
            /[\\/:*?"<>|]/g,
            "_",
          );
          const fileId = await uploadBambooEmployeeFile(
            employeeId,
            { name, data: blob.data, contentType: r.contentType },
            bambooReceiptsCategoryId,
          );
          await db.update(receipts).set({ bambooFileId: fileId }).where(eq(receipts.id, r.id));
          summary.files++;
        }
      }
    } catch (err) {
      summary.failed++;
      await db
        .update(expenseItems)
        .set({ bambooSyncError: (err instanceof Error ? err.message : "Unexpected error").slice(0, 300) })
        .where(eq(expenseItems.id, item.id));
    }
  }
  return summary;
}
