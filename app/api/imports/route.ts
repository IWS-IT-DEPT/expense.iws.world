import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, cards, transactions } from "@/db/schema";
import { canReview, getCurrentUser } from "@/lib/current-user";
import { normalizeMerchant } from "@/lib/merchant";
import { autoMatchImportedTransaction } from "@/lib/receipt-match";
import { getTransactionSource } from "@/lib/transactions";
import { recordMerchant } from "@/lib/txn-flags";

export const runtime = "nodejs";

/**
 * POST /api/imports  (multipart form-data)
 *   cardAccountId: uuid
 *   file: the statement CSV
 *
 * Idempotent: re-importing the same statement inserts nothing new
 * (unique on card_account_id + external_id).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canReview(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const cardAccountId = String(form.get("cardAccountId") || "");
  const file = form.get("file");
  if (!cardAccountId || !(file instanceof File)) {
    return NextResponse.json({ error: "cardAccountId and file are required" }, { status: 400 });
  }

  const account = await db.query.cardAccounts.findFirst({
    where: eq(cardAccounts.id, cardAccountId),
  });
  if (!account) return NextResponse.json({ error: "Unknown card account" }, { status: 404 });

  const source = getTransactionSource(account.importProfile);
  const { transactions: parsed, skipped } = source.parseCsv(await file.text());

  // Only approved, active cards auto-assign a cardholder. Charges on a
  // self-registered card that's still pending import as "unassigned".
  const knownCards = await db.query.cards.findMany({
    where: and(
      eq(cards.cardAccountId, cardAccountId),
      eq(cards.approvalStatus, "approved"),
      eq(cards.active, true),
    ),
  });
  const cardByLast4 = new Map(knownCards.map((c) => [c.last4, c]));

  let inserted = 0;
  let autoMatched = 0;
  let matchSuggested = 0;
  for (const t of parsed) {
    const card = t.cardLast4 ? cardByLast4.get(t.cardLast4) : undefined;
    const assignedUserId = card?.userId ?? null;
    const normalized = normalizeMerchant(t.merchantRaw);

    const result = await db
      .insert(transactions)
      .values({
        cardAccountId,
        cardId: card?.id ?? null,
        assignedUserId,
        txnDate: t.txnDate,
        postDate: t.postDate,
        amountCents: t.amountCents,
        currency: t.currency,
        merchantRaw: t.merchantRaw,
        merchantNormalized: normalized,
        descriptionRaw: t.descriptionRaw,
        mcc: t.mcc,
        source: "csv",
        externalId: t.externalId,
        status: assignedUserId ? "uncoded" : "unassigned",
        importedById: user.id,
      })
      .onConflictDoNothing({ target: [transactions.cardAccountId, transactions.externalId] })
      .returning({ id: transactions.id });

    if (result.length) {
      inserted++;
      if (normalized) await recordMerchant(normalized, t.merchantRaw);
      if (assignedUserId) {
        const outcome = await autoMatchImportedTransaction(result[0].id, user.id);
        if (outcome === "applied") autoMatched++;
        else if (outcome === "suggested") matchSuggested++;
      }
    }
  }

  await db
    .update(cardAccounts)
    .set({ lastImportedAt: new Date() })
    .where(eq(cardAccounts.id, cardAccountId));

  return NextResponse.json({
    parsed: parsed.length,
    inserted,
    duplicatesSkipped: parsed.length - inserted,
    unparseableRows: skipped,
    autoMatched,
    matchSuggested,
  });
}
