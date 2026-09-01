"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { toDataURL } from "qrcode";

import { db } from "@/db";
import {
  approvals,
  cards,
  expenseItems,
  pendingExpenses,
  receiptUploadSessions,
  receipts,
} from "@/db/schema";
import { validateCoding, type CostingMode } from "@/lib/coding";
import { canReview, requireUser } from "@/lib/current-user";
import { checkExpenseLine, isBlocked, loadPolicy } from "@/lib/expense-checks";
import { normalizeMerchant } from "@/lib/merchant";
import { notifyAccountingSubmitted } from "@/lib/notify";
import { rateForDate, mileageAmountCents } from "@/lib/mileage";
import { blobStore } from "@/lib/storage";
import { signUploadToken, type UploadPurpose } from "@/lib/upload-token";

/* ------------------------------------------------------------------ helpers */

export interface FormState {
  ok?: boolean;
  id?: string;
  error?: string;
}

const EDITABLE = ["draft", "rejected"] as const;

function revalidateExpenses(extra?: string) {
  revalidatePath("/expenses");
  revalidatePath("/report");
  revalidatePath("/");
  if (extra) revalidatePath(extra);
}

function parseAmountCents(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

interface Coding {
  entityId: string | null;
  locationId: string | null;
  unitId: string | null;
  jobId: string | null;
  categoryId: string | null;
  businessPurpose: string | null;
  error?: string;
}

/** Parse the coding half of a form. `mode: "required"` rejects partial/empty. */
async function parseCoding(fd: FormData, mode: "optional" | "required"): Promise<Coding> {
  const entityId = String(fd.get("entityId") || "") || null;
  const locationId = String(fd.get("locationId") || "") || null;
  const unitId = String(fd.get("unitId") || "") || null;
  const jobId = String(fd.get("jobId") || "") || null;
  const categoryId = String(fd.get("categoryId") || "") || null;
  const businessPurpose = String(fd.get("businessPurpose") || "").trim() || null;

  const blank: Coding = {
    entityId: null,
    locationId: null,
    unitId: null,
    jobId: null,
    categoryId: null,
    businessPurpose: null,
  };
  const touched = entityId || locationId || categoryId || businessPurpose;
  if (mode === "optional" && !touched) return blank;

  if (!entityId || !locationId || !categoryId || !businessPurpose) {
    return { ...blank, error: "Fill in entity, location, category and a business purpose." };
  }

  const [entity, category] = await Promise.all([
    db.query.entities.findFirst({ where: (e, { eq: q }) => q(e.id, entityId) }),
    db.query.categories.findFirst({ where: (c, { eq: q }) => q(c.id, categoryId) }),
  ]);
  if (!entity || !category) return { ...blank, error: "Invalid entity or category." };

  const problems = validateCoding({
    costingMode: entity.costingMode as CostingMode,
    hasUnit: !!unitId,
    hasJob: !!jobId,
    category,
    businessPurpose,
  });
  if (problems.length) return { ...blank, error: problems[0].message };

  return { entityId, locationId, unitId, jobId, categoryId, businessPurpose };
}

async function ownsEditableCardExpense(id: string, userId: string) {
  const row = await db.query.pendingExpenses.findFirst({ where: eq(pendingExpenses.id, id) });
  if (!row || row.userId !== userId) return null;
  if (!EDITABLE.includes(row.status as (typeof EDITABLE)[number])) return null;
  return row;
}

/* ------------------------------------------------------------ card expenses */

export async function createCardExpense(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();

  const merchant = String(fd.get("merchant") || "").trim();
  const amountCents = parseAmountCents(String(fd.get("amount") || ""));
  const purchaseDate = String(fd.get("purchaseDate") || "");
  const cardId = String(fd.get("cardId") || "") || null;
  const notes = String(fd.get("notes") || "").trim() || null;

  if (!merchant) return { error: "Merchant is required." };
  if (amountCents === null) return { error: "Enter a valid amount." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return { error: "Pick a purchase date." };
  if (cardId) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card || card.userId !== user.id) return { error: "That isn't one of your cards." };
  }

  const coding = await parseCoding(fd, "optional");
  if (coding.error) return { error: coding.error };

  const [created] = await db
    .insert(pendingExpenses)
    .values({
      userId: user.id,
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      amountCents,
      purchaseDate,
      cardId,
      notes,
      status: "draft",
      entityId: coding.entityId,
      locationId: coding.locationId,
      unitId: coding.unitId,
      jobId: coding.jobId,
      categoryId: coding.categoryId,
      businessPurpose: coding.businessPurpose,
      createdById: user.id,
    })
    .returning({ id: pendingExpenses.id });

  revalidateExpenses();
  return { ok: true, id: created.id };
}

export async function updateCardExpense(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");
  const existing = await ownsEditableCardExpense(id, user.id);
  if (!existing) return { error: "Not found or already submitted." };

  const merchant = String(fd.get("merchant") || "").trim();
  const amountCents = parseAmountCents(String(fd.get("amount") || ""));
  const purchaseDate = String(fd.get("purchaseDate") || "");
  const cardId = String(fd.get("cardId") || "") || null;
  const notes = String(fd.get("notes") || "").trim() || null;

  if (!merchant) return { error: "Merchant is required." };
  if (amountCents === null) return { error: "Enter a valid amount." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return { error: "Pick a purchase date." };
  if (cardId) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card || card.userId !== user.id) return { error: "That isn't one of your cards." };
  }

  const coding = await parseCoding(fd, "optional");
  if (coding.error) return { error: coding.error };

  await db
    .update(pendingExpenses)
    .set({
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      amountCents,
      purchaseDate,
      cardId,
      notes,
      entityId: coding.entityId,
      locationId: coding.locationId,
      unitId: coding.unitId,
      jobId: coding.jobId,
      categoryId: coding.categoryId,
      businessPurpose: coding.businessPurpose,
      status: existing.status === "rejected" ? "draft" : existing.status,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(pendingExpenses.id, id));

  revalidateExpenses(`/expenses/${id}`);
  return { ok: true, id };
}

export async function voidCardExpense(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");
  const row = await db.query.pendingExpenses.findFirst({ where: eq(pendingExpenses.id, id) });
  if (!row || row.userId !== user.id) return;

  if (row.status === "draft") {
    // never submitted — delete it and its receipts
    const recs = await db.query.receipts.findMany({ where: eq(receipts.pendingExpenseId, id) });
    for (const r of recs) await blobStore.delete(r.blobKey);
    await db.delete(receipts).where(eq(receipts.pendingExpenseId, id));
    await db.delete(pendingExpenses).where(eq(pendingExpenses.id, id));
  } else if (row.status === "rejected") {
    await db
      .update(pendingExpenses)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(pendingExpenses.id, id));
  }
  revalidateExpenses();
}

export async function deleteCardExpenseReceipt(fd: FormData): Promise<void> {
  const user = await requireUser();
  const receiptId = String(fd.get("receiptId") || "");
  const receipt = await db.query.receipts.findFirst({
    where: eq(receipts.id, receiptId),
    with: { pendingExpense: { columns: { userId: true, status: true } } },
  });
  if (!receipt?.pendingExpense) return;
  if (receipt.pendingExpense.userId !== user.id) return;
  if (!EDITABLE.includes(receipt.pendingExpense.status as (typeof EDITABLE)[number])) return;

  await blobStore.delete(receipt.blobKey);
  await db.delete(receipts).where(eq(receipts.id, receiptId));
  revalidateExpenses();
}

/**
 * Submit one finished card purchase straight to accounting — no weekly batch.
 * Guarded so it only fires on a ready line (the UI only shows the button then).
 */
export async function submitCardExpense(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");

  const row = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, id),
    with: { entity: true, category: true, receipts: { columns: { id: true } } },
  });
  if (!row || row.userId !== user.id) return;
  if (row.status !== "draft" && row.status !== "rejected") return;

  const policy = await loadPolicy();
  const checks = checkExpenseLine(
    {
      kind: "card",
      amountCents: row.amountCents,
      entityId: row.entityId,
      locationId: row.locationId,
      categoryId: row.categoryId,
      businessPurpose: row.businessPurpose,
      unitId: row.unitId,
      jobId: row.jobId,
      cardId: row.cardId,
      receiptCount: row.receipts.length,
      costingMode: row.entity?.costingMode as CostingMode | undefined,
      categoryRequiresJobOrUnit: row.category?.requiresJobOrUnit,
    },
    policy,
  );
  if (isBlocked(checks)) return;

  await db
    .update(pendingExpenses)
    .set({ status: "submitted", submittedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(pendingExpenses.id, id),
        inArray(pendingExpenses.status, ["draft", "rejected"]),
      ),
    );
  await db.insert(approvals).values({
    subjectType: "card_expense",
    subjectId: id,
    action: "submit",
    actorId: user.id,
  });
  await notifyAccountingSubmitted(user.name, `a card purchase (${row.merchant})`, row.amountCents);

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id}`);
  revalidatePath("/reconcile");
  revalidatePath("/");
}

/** Submit every ready draft/rejected card purchase for the current user. */
export async function submitAllReadyCardExpenses(): Promise<void> {
  const user = await requireUser();
  const policy = await loadPolicy();
  const rows = await db.query.pendingExpenses.findMany({
    where: and(
      eq(pendingExpenses.userId, user.id),
      inArray(pendingExpenses.status, ["draft", "rejected"]),
    ),
    with: { entity: true, category: true, receipts: { columns: { id: true } } },
  });

  const readyIds = rows
    .filter(
      (r) =>
        !isBlocked(
          checkExpenseLine(
            {
              kind: "card",
              amountCents: r.amountCents,
              entityId: r.entityId,
              locationId: r.locationId,
              categoryId: r.categoryId,
              businessPurpose: r.businessPurpose,
              unitId: r.unitId,
              jobId: r.jobId,
              cardId: r.cardId,
              receiptCount: r.receipts.length,
              costingMode: r.entity?.costingMode as CostingMode | undefined,
              categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
            },
            policy,
          ),
        ),
    )
    .map((r) => r.id);
  if (readyIds.length === 0) return;

  await db
    .update(pendingExpenses)
    .set({ status: "submitted", submittedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
    .where(inArray(pendingExpenses.id, readyIds));
  for (const id of readyIds) {
    await db.insert(approvals).values({
      subjectType: "card_expense",
      subjectId: id,
      action: "submit",
      actorId: user.id,
    });
  }

  const total = rows
    .filter((r) => readyIds.includes(r.id))
    .reduce((s, r) => s + r.amountCents, 0);
  await notifyAccountingSubmitted(
    user.name,
    `${readyIds.length} card ${readyIds.length === 1 ? "purchase" : "purchases"}`,
    total,
  );

  revalidatePath("/expenses");
  revalidatePath("/report");
  revalidatePath("/reconcile");
  revalidatePath("/");
}

/* --------------------------------------------------------- expense items */

async function writeItem(
  fd: FormData,
  kind: "out_of_pocket" | "mileage",
  userId: string,
  existingId: string | null,
): Promise<FormState> {
  if (existingId) {
    const row = await ownsEditableItem(existingId, userId);
    if (!row) return { error: "Not found or already submitted." };
    if (row.kind !== kind) return { error: "Wrong kind." };
  }

  const itemDate = String(fd.get("itemDate") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(itemDate)) return { error: "Pick a date." };

  const coding = await parseCoding(fd, "required");
  if (coding.error) return { error: coding.error };

  let amountCents: number;
  const extra: Record<string, unknown> = {};

  if (kind === "out_of_pocket") {
    const cents = parseAmountCents(String(fd.get("amount") || ""));
    if (cents === null) return { error: "Enter a valid amount." };
    amountCents = cents;
    const pm = String(fd.get("paymentMethod") || "");
    if (!["personal_card", "cash", "personal_check"].includes(pm)) {
      return { error: "Pick how you paid." };
    }
    extra.paymentMethod = pm;
  } else {
    const miles = Number(String(fd.get("miles") || ""));
    if (!Number.isFinite(miles) || miles <= 0) return { error: "Enter the miles driven." };
    try {
      const rate = await rateForDate(itemDate);
      amountCents = mileageAmountCents(miles, rate.ratePerMile);
      extra.miles = miles.toFixed(1);
      extra.mileageRateId = rate.id;
      extra.tripFrom = String(fd.get("tripFrom") || "").trim() || null;
      extra.tripTo = String(fd.get("tripTo") || "").trim() || null;
    } catch {
      return { error: `No mileage rate is configured for ${itemDate} — ask an admin to add one.` };
    }
  }

  const values = {
    itemDate,
    amountCents,
    entityId: coding.entityId!,
    locationId: coding.locationId!,
    unitId: coding.unitId,
    jobId: coding.jobId,
    categoryId: coding.categoryId!,
    businessPurpose: coding.businessPurpose!,
    ...extra,
  };

  if (existingId) {
    await db
      .update(expenseItems)
      .set({ ...values, status: "draft", updatedAt: new Date() })
      .where(eq(expenseItems.id, existingId));
    revalidateExpenses(`/expenses/${existingId}`);
    return { ok: true, id: existingId };
  }

  const [created] = await db
    .insert(expenseItems)
    .values({ userId, kind, status: "draft", ...values })
    .returning({ id: expenseItems.id });
  revalidateExpenses();
  return { ok: true, id: created.id };
}

async function ownsEditableItem(id: string, userId: string) {
  const row = await db.query.expenseItems.findFirst({ where: eq(expenseItems.id, id) });
  if (!row || row.userId !== userId) return null;
  if (!EDITABLE.includes(row.status as (typeof EDITABLE)[number])) return null;
  return row;
}

export async function createOutOfPocket(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return writeItem(fd, "out_of_pocket", user.id, null);
}

export async function createMileage(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return writeItem(fd, "mileage", user.id, null);
}

export async function updateExpenseItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");
  const row = await db.query.expenseItems.findFirst({ where: eq(expenseItems.id, id) });
  if (!row || row.userId !== user.id) return { error: "Not found." };
  return writeItem(fd, row.kind, user.id, id);
}

export async function voidExpenseItem(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");
  const row = await db.query.expenseItems.findFirst({ where: eq(expenseItems.id, id) });
  if (!row || row.userId !== user.id) return;
  if (row.status !== "draft" && row.status !== "rejected") return; // locked once submitted

  const recs = await db.query.receipts.findMany({ where: eq(receipts.expenseItemId, id) });
  for (const r of recs) await blobStore.delete(r.blobKey);
  await db.delete(receipts).where(eq(receipts.expenseItemId, id));
  await db.delete(expenseItems).where(eq(expenseItems.id, id));
  revalidateExpenses();
}

export async function deleteExpenseItemReceipt(fd: FormData): Promise<void> {
  const user = await requireUser();
  const receiptId = String(fd.get("receiptId") || "");
  const receipt = await db.query.receipts.findFirst({
    where: eq(receipts.id, receiptId),
    with: { expenseItem: { columns: { userId: true, status: true } } },
  });
  if (!receipt?.expenseItem || receipt.expenseItem.userId !== user.id) return;
  if (!EDITABLE.includes(receipt.expenseItem.status as (typeof EDITABLE)[number])) return;

  await blobStore.delete(receipt.blobKey);
  await db.delete(receipts).where(eq(receipts.id, receiptId));
  revalidateExpenses();
}

/* -------------------------------------------------- desktop→phone QR handoff */

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
  if (purpose === "pending") {
    const p = await db.query.pendingExpenses.findFirst({
      where: eq(pendingExpenses.id, targetId),
      columns: { userId: true, status: true },
    });
    return !!p && p.userId === userId && EDITABLE.includes(p.status as (typeof EDITABLE)[number]);
  }
  if (purpose === "item") {
    const it = await db.query.expenseItems.findFirst({
      where: eq(expenseItems.id, targetId),
      columns: { userId: true, status: true },
    });
    return (
      !!it &&
      (it.userId === userId || isReviewer) &&
      EDITABLE.includes(it.status as (typeof EDITABLE)[number])
    );
  }
  return false;
}

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
