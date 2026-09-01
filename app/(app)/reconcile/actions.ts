"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { approvals, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money } from "@/lib/format";
import { notifySentBack } from "@/lib/notify";

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
  revalidatePath("/summary");
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
  revalidatePath("/summary");
  return { ok: true };
}
