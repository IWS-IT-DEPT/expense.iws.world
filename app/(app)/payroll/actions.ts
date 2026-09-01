"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money } from "@/lib/format";
import { notifyApproved, notifySentBack } from "@/lib/notify";

function revalidate() {
  revalidatePath("/payroll/reconcile");
  revalidatePath("/payroll/approvals");
  revalidatePath("/payroll/reports");
  revalidatePath("/expenses");
  revalidatePath("/");
}

const itemLabel = (kind: string, cents: number) =>
  `${kind === "mileage" ? "Mileage" : "Out-of-pocket"} · ${money(cents)}`;

/**
 * Roll a report forward once its items settle:
 *   any still `submitted`  → leave it `submitted`
 *   some `reconciled`      → `reconciled` (payroll has checked every line)
 *   all sent back          → `rejected`
 */
async function rollUpReport(reportId: string | null, actorId: string) {
  if (!reportId) return;
  const items = await db.query.expenseItems.findMany({
    where: eq(expenseItems.reportId, reportId),
    columns: { status: true },
  });
  if (items.some((i) => i.status === "submitted")) return;

  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report || report.status !== "submitted") return;

  const next = items.some((i) => i.status === "reconciled") ? "reconciled" : "rejected";
  await db
    .update(expenseReports)
    .set(
      next === "reconciled"
        ? { status: "reconciled", reviewedById: actorId, reviewedAt: new Date(), updatedAt: new Date() }
        : { status: "rejected", updatedAt: new Date() },
    )
    .where(and(eq(expenseReports.id, reportId), eq(expenseReports.status, "submitted")));
  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: reportId,
    action: next === "reconciled" ? "review" : "reject",
    actorId,
  });
}

/* ------------------------------------------------------------- reconcile -- */

/** Payroll confirms a submitted reimbursement line. `ids` (comma-separated) or one `id`. */
export async function reconcileItems(fd: FormData): Promise<void> {
  const user = await requireRole("payroll", "admin");
  const raw = String(fd.get("ids") || fd.get("id") || "").trim();
  const ids = raw ? raw.split(",").filter(Boolean) : [];
  if (ids.length === 0) return;

  const targets = await db.query.expenseItems.findMany({
    where: and(inArray(expenseItems.id, ids), eq(expenseItems.status, "submitted")),
    columns: { id: true, reportId: true },
  });
  if (targets.length === 0) return;

  await db
    .update(expenseItems)
    .set({ status: "reconciled", updatedAt: new Date() })
    .where(
      and(
        inArray(
          expenseItems.id,
          targets.map((t) => t.id),
        ),
        eq(expenseItems.status, "submitted"),
      ),
    );
  for (const t of targets) {
    await db.insert(approvals).values({
      subjectType: "expense_item",
      subjectId: t.id,
      action: "review",
      actorId: user.id,
    });
  }

  const reportIds = [...new Set(targets.map((t) => t.reportId).filter(Boolean))] as string[];
  for (const rid of reportIds) await rollUpReport(rid, user.id);

  revalidate();
}

/** Payroll sends a submitted (or reconciled) reimbursement line back to the employee. */
export async function sendBackItem(fd: FormData): Promise<void> {
  const user = await requireRole("payroll", "admin");
  const id = String(fd.get("id") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back for changes";

  const item = await db.query.expenseItems.findFirst({ where: eq(expenseItems.id, id) });
  if (!item || (item.status !== "submitted" && item.status !== "reconciled")) return;

  await db
    .update(expenseItems)
    .set({ status: "rejected", reportId: null, updatedAt: new Date() })
    .where(eq(expenseItems.id, id));
  await db.insert(approvals).values({
    subjectType: "expense_item",
    subjectId: id,
    action: "request_changes",
    actorId: user.id,
    note: reason,
  });
  await notifySentBack(item.userId, itemLabel(item.kind, item.amountCents), reason, "Payroll");

  await rollUpReport(item.reportId, user.id);
  revalidate();
}

/* -------------------------------------------------------------- approve -- */

/** Payroll approves a reconciled reimbursement report — locks it for payment. */
export async function approveReport(fd: FormData): Promise<void> {
  const user = await requireRole("payroll", "admin");
  const reportId = String(fd.get("reportId") || "");

  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report || report.status !== "reconciled") return;

  await db
    .update(expenseReports)
    .set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(expenseReports.id, reportId), eq(expenseReports.status, "reconciled")));
  await db
    .update(expenseItems)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "reconciled")));
  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: reportId,
    action: "approve",
    actorId: user.id,
  });
  await notifyApproved(report.userId, "your reimbursement report");
  revalidate();
}

/** Payroll sends a reconciled report back — every line returns to the employee. */
export async function sendBackReport(fd: FormData): Promise<void> {
  const user = await requireRole("payroll", "admin");
  const reportId = String(fd.get("reportId") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back for changes";

  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report || report.status !== "reconciled") return;

  await db
    .update(expenseReports)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));
  await db
    .update(expenseItems)
    .set({ status: "rejected", reportId: null, updatedAt: new Date() })
    .where(and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "reconciled")));
  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: reportId,
    action: "reject",
    actorId: user.id,
    note: reason,
  });
  await notifySentBack(report.userId, "your reimbursement report", reason, "Payroll");
  revalidate();
}
