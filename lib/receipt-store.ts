import { eq } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses, receipts, transactions } from "@/db/schema";

import { canReview } from "./current-user";
import { blobStore, receiptKey } from "./storage";
import { refreshTransactionFlags } from "./txn-flags";
import type { UploadPurpose } from "./upload-token";

/**
 * The one place receipt files are validated, written to blob storage, and
 * recorded in the `receipts` table. Shared by the authenticated upload route
 * (`/api/receipts`) and the token-authenticated QR handoff route
 * (`/api/receipt-upload`).
 */

const MAX_FILE_BYTES = (Number(process.env.RECEIPT_MAX_MB) || 10) * 1024 * 1024;
const MAX_FILES = 12;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const EXT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function resolveContentType(file: File): string | null {
  if (file.type && ALLOWED_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPE[ext] ?? null;
}

export type StoreResult =
  | { ok: true; receiptCount: number; pendingExpenseId?: string; transactionId?: string }
  | { ok: false; status: number; error: string };

export interface StoreReceiptsInput {
  purpose: UploadPurpose;
  /** transaction / pending-expense / expense-item id; ignored for "bank" */
  targetId: string | null;
  /** the user receipts are attributed to (session opener / logged-in user) */
  userId: string;
  files: File[];
}

export async function storeReceipts(input: StoreReceiptsInput): Promise<StoreResult> {
  const { purpose, userId, files } = input;

  if (files.length === 0) return { ok: false, status: 400, error: "No file supplied." };
  if (files.length > MAX_FILES) {
    return { ok: false, status: 413, error: `Too many files (max ${MAX_FILES}).` };
  }

  let total = 0;
  for (const f of files) {
    if (!(f instanceof File)) return { ok: false, status: 400, error: "Malformed upload." };
    if (f.size === 0) return { ok: false, status: 400, error: "Empty file." };
    if (f.size > MAX_FILE_BYTES) {
      return {
        ok: false,
        status: 413,
        error: `"${f.name}" is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`,
      };
    }
    if (!resolveContentType(f)) {
      return { ok: false, status: 415, error: `"${f.name}" is not an image or PDF.` };
    }
    total += f.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return { ok: false, status: 413, error: "Upload is too large." };
  }

  const actor = await db.query.users.findFirst({ where: (u, { eq: e }) => e(u.id, userId) });
  if (!actor || !actor.active) return { ok: false, status: 403, error: "Account not found." };
  const reviewer = canReview(actor);

  // Resolve the storage scope + FK column, checking ownership.
  let scope: "txn" | "item" | "pending";
  let targetId: string;
  let target: "transaction" | "expenseItem" | "pending";

  if (purpose === "txn") {
    if (!input.targetId) return { ok: false, status: 400, error: "Missing transaction id." };
    const txn = await db.query.transactions.findFirst({
      where: eq(transactions.id, input.targetId),
      columns: { id: true, assignedUserId: true },
    });
    if (!txn) return { ok: false, status: 404, error: "Transaction not found." };
    if (txn.assignedUserId !== userId && !reviewer) {
      return { ok: false, status: 403, error: "This charge is assigned to someone else." };
    }
    scope = "txn";
    targetId = txn.id;
    target = "transaction";
  } else if (purpose === "item") {
    if (!input.targetId) return { ok: false, status: 400, error: "Missing expense item id." };
    const item = await db.query.expenseItems.findFirst({
      where: eq(expenseItems.id, input.targetId),
      columns: { id: true, userId: true },
    });
    if (!item) return { ok: false, status: 404, error: "Expense item not found." };
    if (item.userId !== userId && !reviewer) {
      return { ok: false, status: 403, error: "This expense item belongs to someone else." };
    }
    scope = "item";
    targetId = item.id;
    target = "expenseItem";
  } else if (purpose === "pending") {
    if (!input.targetId) return { ok: false, status: 400, error: "Missing expense id." };
    const pending = await db.query.pendingExpenses.findFirst({
      where: eq(pendingExpenses.id, input.targetId),
      columns: { id: true, userId: true, status: true },
    });
    if (!pending) return { ok: false, status: 404, error: "Expense not found." };
    if (pending.userId !== userId) {
      return { ok: false, status: 403, error: "This expense belongs to someone else." };
    }
    if (pending.status !== "draft" && pending.status !== "rejected") {
      return { ok: false, status: 409, error: "This expense is already submitted." };
    }
    scope = "pending";
    targetId = pending.id;
    target = "pending";
  } else {
    // "bank": receipt-first — create a draft card expense to fill in later
    const [created] = await db
      .insert(pendingExpenses)
      .values({
        userId,
        merchant: "Untitled purchase",
        merchantNormalized: "",
        amountCents: 0,
        purchaseDate: new Date().toISOString().slice(0, 10),
        status: "draft",
        createdById: userId,
      })
      .returning({ id: pendingExpenses.id });
    scope = "pending";
    targetId = created.id;
    target = "pending";
  }

  const link = (): { transactionId: string } | { expenseItemId: string } | { pendingExpenseId: string } =>
    target === "transaction"
      ? { transactionId: targetId }
      : target === "expenseItem"
        ? { expenseItemId: targetId }
        : { pendingExpenseId: targetId };

  let stored = 0;
  for (const file of files) {
    const contentType = resolveContentType(file)!;
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = receiptKey(scope, targetId, file.name || `receipt.${scope}`);
    const put = await blobStore.put(key, buffer, contentType);
    await db.insert(receipts).values({
      ...link(),
      blobKey: put.key,
      filename: file.name || "receipt",
      contentType,
      sizeBytes: put.size,
      uploadedById: userId,
    });
    stored++;
  }

  if (target === "transaction") await refreshTransactionFlags(targetId);

  return {
    ok: true,
    receiptCount: stored,
    ...(target === "transaction"
      ? { transactionId: targetId }
      : { pendingExpenseId: targetId }),
  };
}
