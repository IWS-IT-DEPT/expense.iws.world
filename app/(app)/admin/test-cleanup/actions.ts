"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  approvals,
  expenseItems,
  expenseReports,
  pendingExpenses,
  receipts,
  transactions,
  trips,
} from "@/db/schema";
import { deleteBambooEmployeeFile, deleteBambooTableRow } from "@/lib/bamboohr";
import { requireRole } from "@/lib/current-user";
import { blobStore } from "@/lib/storage";

import { testDeleteEnabled } from "./enabled";

const NUMERIC_ID = /^\d+$/;

/**
 * TEMPORARY — permanently deletes a reimbursement report that was only a test,
 * including its lines, receipts, approval history and (best effort) the rows/files it
 * created in BambooHR. Off unless ENABLE_TEST_DELETE=true; remove the env var to retire it.
 * Approved reports are the company's financial record, so this is admin-only and needs
 * the word DELETE typed.
 */
export async function deleteTestReport(fd: FormData) {
  const me = await requireRole("admin");
  if (!testDeleteEnabled) return;
  const reportId = String(fd.get("reportId") ?? "");
  if (String(fd.get("confirm") ?? "").trim() !== "DELETE") redirect("/admin/test-cleanup?error=confirm");

  const report = await db.query.expenseReports.findFirst({
    where: eq(expenseReports.id, reportId),
    with: { items: { with: { receipts: true, user: { columns: { bambooEmployeeId: true } } } } },
  });
  if (!report) redirect("/admin/test-cleanup?error=missing");

  // 1. BambooHR first. If a real delete fails, stop BEFORE touching our data so the ids
  //    that point at the Bamboo records aren't lost.
  const manual: string[] = [];
  const empId = report.items[0]?.user.bambooEmployeeId ?? null;
  let bambooFailed = false;
  try {
    for (const it of report.items) {
      if (it.bambooRowId && empId) {
        if (NUMERIC_ID.test(it.bambooRowId)) {
          await deleteBambooTableRow(
            empId,
            it.kind === "mileage" ? "customMileageReimbursement" : "customExpenseTracking",
            it.bambooRowId,
          );
        } else manual.push("a table row");
      }
      for (const r of it.receipts) {
        if (r.bambooFileId && empId) {
          if (NUMERIC_ID.test(r.bambooFileId)) await deleteBambooEmployeeFile(empId, r.bambooFileId);
          else manual.push("a receipt file");
        }
      }
    }
  } catch {
    bambooFailed = true;
  }
  if (bambooFailed) redirect("/admin/test-cleanup?error=bamboo");

  const itemIds = report.items.map((i) => i.id);
  // 2. Receipt files, then every row that points at the report or its lines.
  for (const it of report.items) {
    for (const r of it.receipts) await blobStore.delete(r.blobKey).catch(() => {});
  }
  if (itemIds.length) {
    await db.update(trips).set({ expenseItemId: null }).where(inArray(trips.expenseItemId, itemIds));
    await db.delete(receipts).where(inArray(receipts.expenseItemId, itemIds));
    await db.delete(expenseItems).where(inArray(expenseItems.id, itemIds)); // flags cascade
  }
  await db.update(pendingExpenses).set({ reportId: null }).where(eq(pendingExpenses.reportId, reportId));
  await db.update(transactions).set({ reportId: null }).where(eq(transactions.reportId, reportId));
  await db
    .delete(approvals)
    .where(and(eq(approvals.subjectType, "expense_report"), eq(approvals.subjectId, reportId)));
  await db.delete(expenseReports).where(eq(expenseReports.id, reportId));

  console.warn(`[test-cleanup] ${me.email} deleted report ${reportId} (${itemIds.length} lines)`);
  revalidatePath("/admin/test-cleanup");
  revalidatePath("/payroll/requests");
  revalidatePath("/payroll/reports");
  redirect(`/admin/test-cleanup?deleted=${itemIds.length}${manual.length ? `&manual=${manual.length}` : ""}`);
}
