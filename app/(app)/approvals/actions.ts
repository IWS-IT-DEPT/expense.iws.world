"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money } from "@/lib/format";
import { notifyApproved, notifySentBack } from "@/lib/notify";

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

  const targets = await db.query.pendingExpenses.findMany({
    where: ids
      ? and(inArray(pendingExpenses.id, ids), eq(pendingExpenses.status, "reconciled"))
      : eq(pendingExpenses.status, "reconciled"),
    columns: { id: true, userId: true, actualAmountCents: true, amountCents: true },
  });
  if (targets.length === 0) return;

  await db
    .update(pendingExpenses)
    .set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(inArray(pendingExpenses.id, targets.map((t) => t.id)));

  for (const t of targets) {
    await db.insert(approvals).values({
      subjectType: "card_expense",
      subjectId: t.id,
      action: "approve",
      actorId: user.id,
    });
  }

  // one email per cardholder
  const byUser = new Map<string, number>();
  for (const t of targets) {
    byUser.set(t.userId, (byUser.get(t.userId) ?? 0) + (t.actualAmountCents ?? t.amountCents));
  }
  for (const [userId, total] of byUser) {
    const n = targets.filter((t) => t.userId === userId).length;
    await notifyApproved(userId, `${n} card ${n === 1 ? "charge" : "charges"} · ${money(total)}`);
  }

  revalidate();
}

export async function sendBackCardExpense(fd: FormData): Promise<void> {
  const user = await requireRole("approver", "admin");
  const id = String(fd.get("id") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back by approver";

  const line = await db.query.pendingExpenses.findFirst({ where: eq(pendingExpenses.id, id) });
  if (!line || line.status !== "reconciled") return;

  await db
    .update(pendingExpenses)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(and(eq(pendingExpenses.id, id), eq(pendingExpenses.status, "reconciled")));
  await db.insert(approvals).values({
    subjectType: "card_expense",
    subjectId: id,
    action: "reject",
    actorId: user.id,
    note: reason,
  });
  await notifySentBack(line.userId, `${line.merchant} · ${money(line.amountCents)}`, reason);

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
  await notifyApproved(report.userId, "your reimbursement report");
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
  await notifySentBack(report.userId, "your reimbursement report", reason);
  revalidate();
}
