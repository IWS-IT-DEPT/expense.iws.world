import { sql } from "drizzle-orm";

import { db } from "@/db";
import { merchants } from "@/db/schema";

/**
 * Legacy hook from the CSV-import era. Imported `transactions` and their
 * `exception_flags` are no longer part of the workflow (cardholders enter
 * expenses directly — see `lib/expense-checks.ts` for the current rule set), so
 * this is a no-op kept only so old call sites keep compiling until they're
 * removed.
 */
export async function refreshTransactionFlags(_transactionId: string): Promise<void> {
  void _transactionId;
}

/** Bumps the learned merchant list; call once per newly-seen merchant. */
export async function recordMerchant(normalizedName: string, displayName: string): Promise<void> {
  await db
    .insert(merchants)
    .values({ normalizedName, displayName, txnCount: 1 })
    .onConflictDoUpdate({
      target: merchants.normalizedName,
      set: { txnCount: sql`${merchants.txnCount} + 1` },
    });
}
