import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { exceptionFlags, merchants, transactions } from "@/db/schema";
import { computeFlags } from "./exceptions";
import { splitsBalance } from "./coding";

/**
 * Recomputes the automatic exception flags for a transaction. Unresolved
 * auto-flags are replaced; flags a reviewer has already resolved are left alone.
 */
export async function refreshTransactionFlags(transactionId: string): Promise<void> {
  const txn = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
    with: {
      allocations: true,
      cardAccount: true,
      receipts: true,
    },
  });
  if (!txn) return;

  const allocs = txn.allocations;
  const isCoded = allocs.length > 0 && allocs.every((a) => a.businessPurpose?.trim());
  const hasReceipt = txn.receipts.length > 0;
  const isIntercompany = allocs.some((a) => a.isIntercompany);
  const balanced =
    allocs.length === 0 ? true : splitsBalance(txn.amountCents, allocs.map((a) => a.amountCents));

  // receiptAlwaysRequired if any allocation's category demands it
  const categoryRows = allocs.length
    ? await db.query.categories.findMany({
        where: (c, { inArray }) => inArray(c.id, allocs.map((a) => a.categoryId)),
      })
    : [];
  const receiptAlwaysRequired = categoryRows.some((c) => c.receiptAlwaysRequired);

  // new merchant?
  let merchantIsNew = false;
  if (txn.merchantNormalized) {
    const known = await db.query.merchants.findFirst({
      where: eq(merchants.normalizedName, txn.merchantNormalized),
    });
    merchantIsNew = !known || known.txnCount <= 1;
  }

  // possible duplicate: same card account, amount, merchant, date, different id
  const dup = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.cardAccountId, txn.cardAccountId),
      eq(transactions.amountCents, txn.amountCents),
      eq(transactions.merchantRaw, txn.merchantRaw),
      eq(transactions.txnDate, txn.txnDate),
      ne(transactions.id, txn.id),
    ),
  });

  const computed = computeFlags({
    amountCents: txn.amountCents,
    hasReceipt,
    receiptAlwaysRequired,
    isCoded,
    isIntercompany,
    splitsBalance: balanced,
    merchantIsNew,
    duplicateOf: dup?.id ?? null,
  });

  await db
    .delete(exceptionFlags)
    .where(and(eq(exceptionFlags.transactionId, transactionId), eq(exceptionFlags.resolved, false)));
  if (computed.length) {
    await db.insert(exceptionFlags).values(
      computed.map((f) => ({
        transactionId,
        type: f.type,
        severity: f.severity,
        detail: f.detail,
      })),
    );
  }
}

/** Bumps the learned merchant list; call once per imported transaction. */
export async function recordMerchant(normalizedName: string, displayName: string): Promise<void> {
  await db
    .insert(merchants)
    .values({ normalizedName, displayName, txnCount: 1 })
    .onConflictDoUpdate({
      target: merchants.normalizedName,
      set: { txnCount: sql`${merchants.txnCount} + 1` },
    });
}
