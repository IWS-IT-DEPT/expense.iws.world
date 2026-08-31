"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { toDataURL } from "qrcode";

import { db } from "@/db";
import {
  cardAccounts,
  expenseItems,
  pendingExpenses,
  receiptUploadSessions,
  receipts,
  transactions,
} from "@/db/schema";
import { isIntercompany, validateCoding, type CostingMode } from "@/lib/coding";
import { canReview, requireUser } from "@/lib/current-user";
import { normalizeMerchant } from "@/lib/merchant";
import { applyPendingToTransaction } from "@/lib/receipt-match";
import { blobStore } from "@/lib/storage";
import { signUploadToken, type UploadPurpose } from "@/lib/upload-token";

export interface PendingExpenseState {
  ok?: boolean;
  id?: string;
  error?: string;
}

interface ParsedCoding {
  entityId: string | null;
  locationId: string | null;
  unitId: string | null;
  jobId: string | null;
  categoryId: string | null;
  businessPurpose: string | null;
  coded: boolean;
  isIntercompany: boolean;
  error?: string;
}

/** Parse + validate the coding half of the form. Coding is optional (stash now,
 *  code later); if the user filled it in, it must be complete + valid. */
async function parseCoding(fd: FormData, cardAccountId: string | null): Promise<ParsedCoding> {
  const entityId = String(fd.get("entityId") || "") || null;
  const locationId = String(fd.get("locationId") || "") || null;
  const unitId = String(fd.get("unitId") || "") || null;
  const jobId = String(fd.get("jobId") || "") || null;
  const categoryId = String(fd.get("categoryId") || "") || null;
  const businessPurpose = String(fd.get("businessPurpose") || "").trim() || null;

  const touched = entityId || locationId || categoryId || businessPurpose;
  const empty: ParsedCoding = {
    entityId: null,
    locationId: null,
    unitId: null,
    jobId: null,
    categoryId: null,
    businessPurpose: null,
    coded: false,
    isIntercompany: false,
  };
  if (!touched) return empty;

  if (!entityId || !locationId || !categoryId || !businessPurpose) {
    return { ...empty, error: "Fill in entity, location, category and business purpose — or leave them all blank to code it later." };
  }

  const [entity, category] = await Promise.all([
    db.query.entities.findFirst({ where: (e, { eq: q }) => q(e.id, entityId) }),
    db.query.categories.findFirst({ where: (c, { eq: q }) => q(c.id, categoryId) }),
  ]);
  if (!entity || !category) return { ...empty, error: "Invalid entity or category." };

  const problems = validateCoding({
    costingMode: entity.costingMode as CostingMode,
    hasUnit: !!unitId,
    hasJob: !!jobId,
    category,
    businessPurpose,
  });
  if (problems.length) return { ...empty, error: problems[0].message };

  let intercompany = false;
  if (cardAccountId) {
    const card = await db.query.cardAccounts.findFirst({
      where: eq(cardAccounts.id, cardAccountId),
    });
    if (card) intercompany = isIntercompany(entityId, card.owningEntityId);
  }

  return {
    entityId,
    locationId,
    unitId,
    jobId,
    categoryId,
    businessPurpose,
    coded: true,
    isIntercompany: intercompany,
  };
}

function parseAmountCents(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function createPendingExpense(
  _prev: PendingExpenseState,
  fd: FormData,
): Promise<PendingExpenseState> {
  const user = await requireUser();

  const merchant = String(fd.get("merchant") || "").trim();
  const amountCents = parseAmountCents(String(fd.get("amount") || ""));
  const purchaseDate = String(fd.get("purchaseDate") || "");
  const cardAccountId = String(fd.get("cardAccountId") || "") || null;
  const notes = String(fd.get("notes") || "").trim() || null;

  if (!merchant) return { error: "Merchant is required." };
  if (amountCents === null) return { error: "Enter a valid amount." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return { error: "Pick a purchase date." };

  const coding = await parseCoding(fd, cardAccountId);
  if (coding.error) return { error: coding.error };

  const [created] = await db
    .insert(pendingExpenses)
    .values({
      userId: user.id,
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      amountCents,
      purchaseDate,
      cardAccountId,
      notes,
      coded: coding.coded,
      entityId: coding.entityId,
      locationId: coding.locationId,
      unitId: coding.unitId,
      jobId: coding.jobId,
      categoryId: coding.categoryId,
      businessPurpose: coding.businessPurpose,
      isIntercompany: coding.isIntercompany,
      createdById: user.id,
    })
    .returning({ id: pendingExpenses.id });

  revalidatePath("/receipts");
  return { ok: true, id: created.id };
}

export async function updatePendingExpense(
  _prev: PendingExpenseState,
  fd: FormData,
): Promise<PendingExpenseState> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");

  const existing = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, id),
  });
  if (!existing || existing.userId !== user.id) return { error: "Not found." };
  if (existing.status !== "open") return { error: "This entry is already matched." };

  const merchant = String(fd.get("merchant") || "").trim();
  const amountCents = parseAmountCents(String(fd.get("amount") || ""));
  const purchaseDate = String(fd.get("purchaseDate") || "");
  const cardAccountId = String(fd.get("cardAccountId") || "") || null;
  const notes = String(fd.get("notes") || "").trim() || null;

  if (!merchant) return { error: "Merchant is required." };
  if (amountCents === null) return { error: "Enter a valid amount." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return { error: "Pick a purchase date." };

  const coding = await parseCoding(fd, cardAccountId);
  if (coding.error) return { error: coding.error };

  await db
    .update(pendingExpenses)
    .set({
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      amountCents,
      purchaseDate,
      cardAccountId,
      notes,
      coded: coding.coded,
      entityId: coding.entityId,
      locationId: coding.locationId,
      unitId: coding.unitId,
      jobId: coding.jobId,
      categoryId: coding.categoryId,
      businessPurpose: coding.businessPurpose,
      isIntercompany: coding.isIntercompany,
      updatedAt: new Date(),
    })
    .where(eq(pendingExpenses.id, id));

  revalidatePath("/receipts");
  return { ok: true, id };
}

export async function cancelPendingExpense(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");
  await db
    .update(pendingExpenses)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(pendingExpenses.id, id),
        eq(pendingExpenses.userId, user.id),
        eq(pendingExpenses.status, "open"),
      ),
    );
  revalidatePath("/receipts");
}

export async function deletePendingReceipt(fd: FormData): Promise<void> {
  const user = await requireUser();
  const receiptId = String(fd.get("receiptId") || "");

  const receipt = await db.query.receipts.findFirst({
    where: eq(receipts.id, receiptId),
    with: { pendingExpense: { columns: { userId: true } } },
  });
  if (!receipt) return;
  const owns = receipt.uploadedById === user.id || receipt.pendingExpense?.userId === user.id;
  if (!owns) return;

  await blobStore.delete(receipt.blobKey);
  await db.delete(receipts).where(eq(receipts.id, receiptId));
  revalidatePath("/receipts");
}

export interface ConfirmMatchState {
  ok?: boolean;
  error?: string;
}

export async function confirmMatch(
  _prev: ConfirmMatchState,
  fd: FormData,
): Promise<ConfirmMatchState> {
  const user = await requireUser();
  const pendingExpenseId = String(fd.get("pendingExpenseId") || "");
  const transactionId = String(fd.get("transactionId") || "");

  const pending = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, pendingExpenseId),
  });
  if (!pending || pending.userId !== user.id) return { error: "Bank entry not found." };

  const res = await applyPendingToTransaction(pendingExpenseId, transactionId, user.id, {
    auto: false,
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/receipts");
  revalidatePath("/transactions");
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/");
  return { ok: true };
}

export interface UploadLink {
  token: string;
  url: string;
  qrDataUrl: string;
  nonce: string;
  expiresAt: string;
}

const UPLOAD_TTL_SECONDS = 1200;

async function ownsUploadTarget(
  userId: string,
  isReviewer: boolean,
  purpose: UploadPurpose,
  targetId: string | null,
): Promise<boolean> {
  if (purpose === "bank") return true;
  if (!targetId) return false;
  if (purpose === "txn") {
    const t = await db.query.transactions.findFirst({
      where: eq(transactions.id, targetId),
      columns: { assignedUserId: true },
    });
    return !!t && (t.assignedUserId === userId || isReviewer);
  }
  if (purpose === "item") {
    const it = await db.query.expenseItems.findFirst({
      where: eq(expenseItems.id, targetId),
      columns: { userId: true },
    });
    return !!it && (it.userId === userId || isReviewer);
  }
  const p = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, targetId),
    columns: { userId: true, status: true },
  });
  return !!p && p.userId === userId && p.status === "open";
}

/** Mint a signed one-time link + QR for the desktop→phone handoff. */
export async function startReceiptUpload(
  purpose: UploadPurpose,
  targetId: string | null,
): Promise<{ ok: true; link: UploadLink } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!(await ownsUploadTarget(user.id, canReview(user), purpose, targetId))) {
    return { ok: false, error: "You can't upload a receipt there." };
  }

  const expiresAt = new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000);
  const [session] = await db
    .insert(receiptUploadSessions)
    .values({
      purpose,
      targetId: purpose === "bank" ? null : targetId,
      userId: user.id,
      expiresAt,
    })
    .returning({ id: receiptUploadSessions.id });

  const token = signUploadToken(
    { p: purpose, t: purpose === "bank" ? null : targetId, u: user.id, n: session.id },
    UPLOAD_TTL_SECONDS,
  );
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const url = `${base}/r/${token}`;
  const qrDataUrl = await toDataURL(url, { margin: 1, width: 240 });

  return {
    ok: true,
    link: { token, url, qrDataUrl, nonce: session.id, expiresAt: expiresAt.toISOString() },
  };
}
