"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

function revalidate() {
  revalidatePath("/approvals");
  revalidatePath("/reconcile");
  revalidatePath("/expenses");
  revalidatePath("/");
}

/* ------------------------------------------------- reconciled card charges */

/** Approver locks reconciled card charges. `ids` (comma-separated) or all. */
export async function approveCardExpenses(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const raw = String(fd.get("ids") || "").trim();
  const ids = raw ? raw.split(",").filter(Boolean) : null;

  const where = ids
    ? and(inArray(pendingExpenses.id, ids), eq(pendingExpenses.status, "reconciled"))
    : eq(pendingExpenses.status, "reconciled");

  const rows = await db
    .update(pendingExpenses)
    .set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(where)
    .returning({ id: pendingExpenses.id });

  for (const r of rows) {
    await db.insert(approvals).values({
      subjectType: "card_expense",
      subjectId: r.id,
      action: "approve",
      actorId: user.id,
    });
  }
  revalidate();
}

export async function sendBackCardExpense(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const id = String(fd.get("id") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back by approver";

  const r = await db
    .update(pendingExpenses)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(and(eq(pendingExpenses.id, id), eq(pendingExpenses.status, "reconciled")))
    .returning({ id: pendingExpenses.id });
  if (r.length) {
    await db.insert(approvals).values({
      subjectType: "card_expense",
      subjectId: id,
      action: "reject",
      actorId: user.id,
      note: reason,
    });
  }
  revalidate();
}

/* ---------------------------------------------- reimbursement (OOP/mileage) */

export async function approveReport(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const reportId = String(fd.get("reportId") || "");

  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report || report.status !== "submitted") return;

  await db
    .update(expenseReports)
    .set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(expenseReports.id, reportId), eq(expenseReports.status, "submitted")));
  await db
    .update(expenseItems)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "submitted")));
  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: reportId,
    action: "approve",
    actorId: user.id,
  });
  revalidate();
}

export async function sendBackReport(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const reportId = String(fd.get("reportId") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back for changes";

  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report || report.status !== "submitted") return;

  await db
    .update(expenseReports)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));
  await db
    .update(expenseItems)
    .set({ status: "rejected", reportId: null, updatedAt: new Date() })
    .where(and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "submitted")));
  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: reportId,
    action: "reject",
    actorId: user.id,
    note: reason,
  });
  revalidate();
}
