"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money } from "@/lib/format";
import { notifyApproved, notifySentBack } from "@/lib/notify";

export interface LineActionState {
  ok?: boolean;
  error?: string;
}

function parseAmountCents(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Accounting confirms a submitted card charge against the statement. */
export async function reconcileLine(_prev: LineActionState, fd: FormData): Promise<LineActionState> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(fd.get("lineId") || "");
  const actualAmount = parseAmountCents(String(fd.get("actualAmount") || ""));
  const actualDateRaw = String(fd.get("actualPurchaseDate") || "");
  const actualDate = /^\d{4}-\d{2}-\d{2}$/.test(actualDateRaw) ? actualDateRaw : null;
  const note = String(fd.get("note") || "").trim() || null;

  const line = await db.query.pendingExpenses.findFirst({ where: eq(pendingExpenses.id, id) });
  if (!line) return { error: "Line not found." };
  if (line.status !== "submitted") return { error: "That line isn't awaiting reconcile." };

  await db
    .update(pendingExpenses)
    .set({
      status: "reconciled",
      reconciledById: user.id,
      reconciledAt: new Date(),
      actualAmountCents: actualAmount ?? line.amountCents,
      actualPurchaseDate: actualDate ?? line.purchaseDate,
      reconcileNote: note,
      updatedAt: new Date(),
    })
    .where(and(eq(pendingExpenses.id, id), eq(pendingExpenses.status, "submitted")));

  await db.insert(approvals).values({
    subjectType: "card_expense",
    subjectId: id,
    action: "review",
    actorId: user.id,
    note: actualAmount || actualDate ? "corrected" : null,
  });

  revalidatePath("/reconcile");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}

/** Send a submitted / reconciled card charge back to the cardholder. */
export async function rejectLine(_prev: LineActionState, fd: FormData): Promise<LineActionState> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(fd.get("lineId") || "");
  const reason = String(fd.get("reason") || "").trim();
  if (!reason) return { error: "Give the cardholder a reason." };

  const line = await db.query.pendingExpenses.findFirst({ where: eq(pendingExpenses.id, id) });
  if (!line) return { error: "Line not found." };
  if (line.status !== "submitted" && line.status !== "reconciled") {
    return { error: "That line can't be sent back now." };
  }

  await db
    .update(pendingExpenses)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(eq(pendingExpenses.id, id));

  await db.insert(approvals).values({
    subjectType: "card_expense",
    subjectId: id,
    action: "request_changes",
    actorId: user.id,
    note: reason,
  });
  await notifySentBack(line.userId, `${line.merchant} · ${money(line.amountCents)}`, reason);

  revalidatePath("/reconcile");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}

/* --------------------------------- out-of-pocket / mileage (no statement) */

const ITEM_LABEL = (kind: string, cents: number) =>
  `${kind === "mileage" ? "Mileage" : "Out-of-pocket"} · ${money(cents)}`;

/** When a report has no `submitted` items left, close it. */
async function maybeCloseReport(reportId: string | null, actorId: string) {
  if (!reportId) return;
  const stillOpen = await db.query.expenseItems.findFirst({
    where: and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "submitted")),
    columns: { id: true },
  });
  if (stillOpen) return;
  const anyApproved = await db.query.expenseItems.findFirst({
    where: and(eq(expenseItems.reportId, reportId), eq(expenseItems.status, "approved")),
    columns: { id: true },
  });
  const next = anyApproved ? "approved" : "rejected";
  const r = await db
    .update(expenseReports)
    .set({ status: next, updatedAt: new Date() })
    .where(and(eq(expenseReports.id, reportId), eq(expenseReports.status, "submitted")))
    .returning({ id: expenseReports.id });
  if (r.length) {
    await db.insert(approvals).values({
      subjectType: "expense_report",
      subjectId: reportId,
      action: next === "approved" ? "approve" : "reject",
      actorId,
    });
  }
}

export async function approveExpenseItem(fd: FormData): Promise<void> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(fd.get("id") || "");
  const item = await db.query.expenseItems.findFirst({ where: eq(expenseItems.id, id) });
  if (!item || item.status !== "submitted") return;

  await db
    .update(expenseItems)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(expenseItems.id, id), eq(expenseItems.status, "submitted")));
  await db.insert(approvals).values({
    subjectType: "expense_item",
    subjectId: id,
    action: "approve",
    actorId: user.id,
  });
  await notifyApproved(item.userId, ITEM_LABEL(item.kind, item.amountCents));
  await maybeCloseReport(item.reportId, user.id);

  revalidatePath("/reconcile");
  revalidatePath("/approvals");
  revalidatePath("/expenses");
  revalidatePath("/");
}

export async function rejectExpenseItem(fd: FormData): Promise<void> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(fd.get("id") || "");
  const reason = String(fd.get("reason") || "").trim() || "Sent back for changes";
  const item = await db.query.expenseItems.findFirst({ where: eq(expenseItems.id, id) });
  if (!item || (item.status !== "submitted" && item.status !== "approved")) return;

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
  await notifySentBack(item.userId, ITEM_LABEL(item.kind, item.amountCents), reason);
  await maybeCloseReport(item.reportId, user.id);

  revalidatePath("/reconcile");
  revalidatePath("/approvals");
  revalidatePath("/expenses");
  revalidatePath("/");
}
