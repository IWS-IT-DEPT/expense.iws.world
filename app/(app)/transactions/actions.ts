"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { allocations, categories, entities, transactions } from "@/db/schema";
import { isIntercompany, validateCoding, type CostingMode } from "@/lib/coding";
import { canReview, requireUser } from "@/lib/current-user";
import { refreshTransactionFlags } from "@/lib/txn-flags";

export interface SaveCodingState {
  ok?: boolean;
  error?: string;
}

/**
 * MVP: one allocation per transaction, covering the full amount. The schema
 * supports splits; the split UI is a later addition.
 */
export async function saveCoding(
  _prev: SaveCodingState,
  formData: FormData,
): Promise<SaveCodingState> {
  const user = await requireUser();
  const transactionId = String(formData.get("transactionId"));

  const txn = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
    with: { cardAccount: true },
  });
  if (!txn) return { error: "Transaction not found." };
  if (txn.assignedUserId !== user.id && !canReview(user)) {
    return { error: "This charge is assigned to someone else." };
  }

  const entityId = String(formData.get("entityId") || "");
  const locationId = String(formData.get("locationId") || "");
  const unitId = String(formData.get("unitId") || "") || null;
  const jobId = String(formData.get("jobId") || "") || null;
  const categoryId = String(formData.get("categoryId") || "");
  const businessPurpose = String(formData.get("businessPurpose") || "").trim();

  if (!entityId || !locationId || !categoryId) {
    return { error: "Entity, location and category are required." };
  }

  const [entity, category] = await Promise.all([
    db.query.entities.findFirst({ where: eq(entities.id, entityId) }),
    db.query.categories.findFirst({ where: eq(categories.id, categoryId) }),
  ]);
  if (!entity || !category) return { error: "Invalid entity or category." };

  const problems = validateCoding({
    costingMode: entity.costingMode as CostingMode,
    hasUnit: !!unitId,
    hasJob: !!jobId,
    category,
    businessPurpose,
  });
  if (problems.length) return { error: problems[0].message };

  const intercompany = isIntercompany(entityId, txn.cardAccount.owningEntityId);

  await db.delete(allocations).where(eq(allocations.transactionId, transactionId));
  await db.insert(allocations).values({
    transactionId,
    amountCents: txn.amountCents,
    entityId,
    locationId,
    unitId,
    jobId,
    categoryId,
    businessPurpose,
    isIntercompany: intercompany,
    createdById: user.id,
  });

  await db
    .update(transactions)
    .set({ status: "coded", updatedAt: new Date() })
    .where(and(eq(transactions.id, transactionId), eq(transactions.status, "uncoded")));
  // rejected -> coded too
  await db
    .update(transactions)
    .set({ status: "coded", updatedAt: new Date() })
    .where(and(eq(transactions.id, transactionId), eq(transactions.status, "rejected")));

  await refreshTransactionFlags(transactionId);

  revalidatePath("/transactions");
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/");
  return { ok: true };
}
