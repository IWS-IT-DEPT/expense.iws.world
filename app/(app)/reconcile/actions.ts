"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseReports, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

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

/** If every submitted card line under a report is now handled, advance the report. */
async function maybeAdvanceReport(reportId: string | null, actorId: string) {
  if (!reportId) return;
  const stillOpen = await db.query.pendingExpenses.findFirst({
    where: and(eq(pendingExpenses.reportId, reportId), eq(pendingExpenses.status, "submitted")),
    columns: { id: true },
  });
  if (stillOpen) return;
  const r = await db
    .update(expenseReports)
    .set({ status: "reconciled", updatedAt: new Date() })
    .where(and(eq(expenseReports.id, reportId), eq(expenseReports.status, "submitted")))
    .returning({ id: expenseReports.id });
  if (r.length) {
    await db.insert(approvals).values({
      subjectType: "expense_report",
      subjectId: reportId,
      action: "review",
      actorId,
    });
  }
}

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

  await maybeAdvanceReport(line.reportId, user.id);

  revalidatePath("/reconcile");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}

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
    .set({ status: "rejected", rejectionReason: reason, reportId: null, updatedAt: new Date() })
    .where(eq(pendingExpenses.id, id));

  await db.insert(approvals).values({
    subjectType: "card_expense",
    subjectId: id,
    action: "request_changes",
    actorId: user.id,
    note: reason,
  });

  // the line left the report — advance it if everything else is handled
  await maybeAdvanceReport(line.reportId, user.id);

  revalidatePath("/reconcile");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}
