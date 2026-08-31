"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

export async function approveReport(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const reportId = String(fd.get("reportId") || "");

  const report = await db.query.expenseReports.findFirst({
    where: eq(expenseReports.id, reportId),
  });
  if (!report || report.status !== "reconciled") return;

  await db
    .update(expenseReports)
    .set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(expenseReports.id, reportId), eq(expenseReports.status, "reconciled")));
  await db
    .update(pendingExpenses)
    .set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(pendingExpenses.reportId, reportId), eq(pendingExpenses.status, "reconciled")));
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

  revalidatePath("/approvals");
  revalidatePath("/reconcile");
  revalidatePath("/");
}

export async function sendBackReport(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const reportId = String(fd.get("reportId") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back for changes";

  const report = await db.query.expenseReports.findFirst({
    where: eq(expenseReports.id, reportId),
  });
  if (!report || report.status !== "reconciled") return;

  await db
    .update(expenseReports)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));
  await db
    .update(pendingExpenses)
    .set({ status: "rejected", rejectionReason: reason, reportId: null, updatedAt: new Date() })
    .where(and(eq(pendingExpenses.reportId, reportId), eq(pendingExpenses.status, "reconciled")));
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

  revalidatePath("/approvals");
  revalidatePath("/reconcile");
  revalidatePath("/");
}
