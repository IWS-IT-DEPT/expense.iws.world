import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  allocations,
  categories,
  entities,
  pendingExpenses,
  receipts,
  transactions,
} from "@/db/schema";

import { isIntercompany, validateCoding, type CostingMode } from "./coding";
import { refreshTransactionFlags } from "./txn-flags";

/**
 * Links Receipt Bank entries (`pending_expenses`) to real card transactions.
 *
 * A bank entry is a purchase the cardholder pre-coded before the charge posted.
 * When accounting imports the statement, `autoMatchImportedTransaction` tries to
 * find the bank entry that this new charge belongs to and, when confident,
 * applies its coding + receipts automatically. Ambiguous cases are surfaced as
 * suggestions on the transaction page and the bank page for a manual confirm.
 */

export const MATCH = {
  /** charge date may differ from the logged purchase date by this many days */
  dateWindowDays: 4,
  /** charge may exceed the logged amount by up to this fraction (tip, tax) */
  amountUnderPct: 0.25,
  /** logged amount may exceed the charge by up to this many cents (rounding) */
  amountOverCents: 200,
  /** auto-apply at/above this score */
  autoApplyScore: 0.82,
  /** surface as a suggestion at/above this score */
  suggestScore: 0.45,
} as const;

export interface MatchSide {
  amountCents: number;
  /** ISO date, YYYY-MM-DD */
  date: string;
  merchantNormalized: string;
}

export interface MatchResult {
  score: number;
  reasons: string[];
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.abs(Math.round(ms / 86_400_000));
}

function scoreAmount(pendingCents: number, txnCents: number): number {
  if (txnCents <= 0) return 0; // only match against charges, not refunds
  if (pendingCents === txnCents) return 0.5;
  if (txnCents > pendingCents && txnCents - pendingCents <= pendingCents * MATCH.amountUnderPct) {
    return 0.35;
  }
  if (pendingCents > txnCents && pendingCents - txnCents <= MATCH.amountOverCents) return 0.3;
  return 0;
}

function scoreDate(days: number): number {
  if (days === 0) return 0.25;
  if (days <= 1) return 0.18;
  if (days <= MATCH.dateWindowDays) return 0.1;
  return -1; // disqualify
}

function tokens(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

function scoreMerchant(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter((x) => tb.has(x)).length;
  if (inter === 0) return 0;
  if (inter === ta.size && inter === tb.size) return 0.25;
  if (inter === ta.size || inter === tb.size) return 0.2;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = inter / union;
  return jaccard >= 0.34 ? 0.25 * jaccard : 0;
}

/** 0 = no match. Amount or date out of range disqualifies outright. */
export function scoreMatch(pending: MatchSide, txn: MatchSide): MatchResult {
  const reasons: string[] = [];

  const amount = scoreAmount(pending.amountCents, txn.amountCents);
  if (amount === 0) return { score: 0, reasons: [] };
  reasons.push(amount === 0.5 ? "exact amount" : "amount within range");

  const dd = daysBetween(txn.date, pending.date);
  const date = scoreDate(dd);
  if (date < 0) return { score: 0, reasons: [] };
  reasons.push(dd === 0 ? "same day" : `${dd} day${dd > 1 ? "s" : ""} apart`);

  const merchant = scoreMerchant(pending.merchantNormalized, txn.merchantNormalized);
  if (merchant > 0) reasons.push("merchant matches");

  return { score: Math.min(1, amount + date + merchant), reasons };
}

export interface Candidate {
  pendingExpenseId: string;
  transactionId: string;
  score: number;
  reasons: string[];
  pending: { merchant: string; amountCents: number; purchaseDate: string; coded: boolean };
  txn: { merchantRaw: string; amountCents: number; txnDate: string; status: string };
}

/** Bank entries that might belong to this freshly-seen / uncoded transaction. */
export async function findMatchesForTransaction(txnId: string): Promise<Candidate[]> {
  const txn = await db.query.transactions.findFirst({
    where: eq(transactions.id, txnId),
    with: { allocations: { columns: { id: true } } },
  });
  if (!txn || !txn.assignedUserId || txn.allocations.length > 0) return [];
  if (!["unassigned", "uncoded", "rejected"].includes(txn.status)) return [];
  if (txn.amountCents <= 0) return [];

  const lo = Math.floor(txn.amountCents / (1 + MATCH.amountUnderPct));
  const hi = txn.amountCents + MATCH.amountOverCents;

  const rows = await db.query.pendingExpenses.findMany({
    where: and(
      eq(pendingExpenses.userId, txn.assignedUserId),
      eq(pendingExpenses.status, "open"),
      gte(pendingExpenses.amountCents, lo),
      lte(pendingExpenses.amountCents, hi),
      gte(pendingExpenses.purchaseDate, addDays(txn.txnDate, -MATCH.dateWindowDays)),
      lte(pendingExpenses.purchaseDate, addDays(txn.txnDate, MATCH.dateWindowDays)),
    ),
  });

  const txnSide: MatchSide = {
    amountCents: txn.amountCents,
    date: txn.txnDate,
    merchantNormalized: txn.merchantNormalized ?? "",
  };

  return rows
    .map((p): Candidate => {
      const { score, reasons } = scoreMatch(
        {
          amountCents: p.amountCents,
          date: p.purchaseDate,
          merchantNormalized: p.merchantNormalized,
        },
        txnSide,
      );
      return {
        pendingExpenseId: p.id,
        transactionId: txn.id,
        score,
        reasons,
        pending: {
          merchant: p.merchant,
          amountCents: p.amountCents,
          purchaseDate: p.purchaseDate,
          coded: p.coded,
        },
        txn: {
          merchantRaw: txn.merchantRaw,
          amountCents: txn.amountCents,
          txnDate: txn.txnDate,
          status: txn.status,
        },
      };
    })
    .filter((c) => c.score >= MATCH.suggestScore)
    .sort((a, b) => b.score - a.score);
}

/** Uncoded transactions this open bank entry might match (for the bank UI). */
export async function findMatchesForPending(pendingId: string): Promise<Candidate[]> {
  const p = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, pendingId),
  });
  if (!p || p.status !== "open") return [];

  const lo = p.amountCents - MATCH.amountOverCents;
  const hi = Math.ceil(p.amountCents * (1 + MATCH.amountUnderPct));

  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.assignedUserId, p.userId),
      inArray(transactions.status, ["unassigned", "uncoded", "rejected"]),
      gte(transactions.amountCents, lo),
      lte(transactions.amountCents, hi),
      gte(transactions.txnDate, addDays(p.purchaseDate, -MATCH.dateWindowDays)),
      lte(transactions.txnDate, addDays(p.purchaseDate, MATCH.dateWindowDays)),
    ),
    with: { allocations: { columns: { id: true } } },
  });

  const pendingSide: MatchSide = {
    amountCents: p.amountCents,
    date: p.purchaseDate,
    merchantNormalized: p.merchantNormalized,
  };

  return rows
    .filter((t) => t.allocations.length === 0)
    .map((t): Candidate => {
      const { score, reasons } = scoreMatch(pendingSide, {
        amountCents: t.amountCents,
        date: t.txnDate,
        merchantNormalized: t.merchantNormalized ?? "",
      });
      return {
        pendingExpenseId: p.id,
        transactionId: t.id,
        score,
        reasons,
        pending: {
          merchant: p.merchant,
          amountCents: p.amountCents,
          purchaseDate: p.purchaseDate,
          coded: p.coded,
        },
        txn: {
          merchantRaw: t.merchantRaw,
          amountCents: t.amountCents,
          txnDate: t.txnDate,
          status: t.status,
        },
      };
    })
    .filter((c) => c.score >= MATCH.suggestScore)
    .sort((a, b) => b.score - a.score);
}

export type ApplyResult = { ok: true } | { ok: false; error: string };

/**
 * Apply a bank entry's coding + receipts to a transaction. Sequential and
 * restart-safe — the Neon HTTP driver has no interactive transactions, so every
 * step is idempotent or guarded (`WHERE status IN (...)`, allocation length
 * check, receipt move keyed on `pendingExpenseId`).
 */
export async function applyPendingToTransaction(
  pendingId: string,
  txnId: string,
  actorId: string,
  opts?: { auto?: boolean },
): Promise<ApplyResult> {
  const pending = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, pendingId),
  });
  if (!pending) return { ok: false, error: "Bank entry not found." };
  if (pending.status === "cancelled") return { ok: false, error: "This bank entry was cancelled." };
  if (
    pending.status === "matched" &&
    pending.matchedTransactionId &&
    pending.matchedTransactionId !== txnId
  ) {
    return { ok: false, error: "This bank entry is already matched to another charge." };
  }

  const txn = await db.query.transactions.findFirst({
    where: eq(transactions.id, txnId),
    with: { allocations: true, cardAccount: true },
  });
  if (!txn) return { ok: false, error: "Transaction not found." };

  const hasAllocation = txn.allocations.length > 0;
  if (hasAllocation && opts?.auto) {
    return { ok: false, error: "Transaction is already coded." };
  }

  if (
    !pending.coded ||
    !pending.entityId ||
    !pending.locationId ||
    !pending.categoryId ||
    !pending.businessPurpose
  ) {
    return { ok: false, error: "Finish coding this bank receipt before matching it." };
  }

  const [entity, category] = await Promise.all([
    db.query.entities.findFirst({ where: eq(entities.id, pending.entityId) }),
    db.query.categories.findFirst({ where: eq(categories.id, pending.categoryId) }),
  ]);
  if (!entity || !category) {
    return { ok: false, error: "The saved coding refers to an entity or category that no longer exists." };
  }

  const problems = validateCoding({
    costingMode: entity.costingMode as CostingMode,
    hasUnit: !!pending.unitId,
    hasJob: !!pending.jobId,
    category,
    businessPurpose: pending.businessPurpose,
  });
  if (problems.length) return { ok: false, error: problems[0].message };

  // 1. ensure the allocation exists (idempotent)
  if (!hasAllocation) {
    await db.insert(allocations).values({
      transactionId: txnId,
      amountCents: txn.amountCents,
      entityId: pending.entityId,
      locationId: pending.locationId,
      unitId: pending.unitId,
      jobId: pending.jobId,
      categoryId: pending.categoryId,
      businessPurpose: pending.businessPurpose,
      isIntercompany: isIntercompany(pending.entityId, txn.cardAccount.owningEntityId),
      createdById: actorId,
    });
  }

  // 2. move the receipt(s) onto the transaction
  await db
    .update(receipts)
    .set({ transactionId: txnId, pendingExpenseId: null })
    .where(eq(receipts.pendingExpenseId, pendingId));

  // 3. advance the transaction (guarded)
  await db
    .update(transactions)
    .set({ status: "coded", updatedAt: new Date() })
    .where(
      and(
        eq(transactions.id, txnId),
        inArray(transactions.status, ["unassigned", "uncoded", "rejected"]),
      ),
    );

  // 4. mark the bank entry matched
  await db
    .update(pendingExpenses)
    .set({
      status: "matched",
      matchedTransactionId: txnId,
      matchedById: actorId,
      matchedAt: new Date(),
      autoMatched: opts?.auto ?? false,
      updatedAt: new Date(),
    })
    .where(eq(pendingExpenses.id, pendingId));

  // 5. recompute flags (missing_receipt / uncategorized clear)
  await refreshTransactionFlags(txnId);

  return { ok: true };
}

/**
 * Called for each newly-inserted transaction during a statement import.
 * Auto-applies only a confident, unambiguous, fully-coded match.
 */
export async function autoMatchImportedTransaction(
  txnId: string,
  actorId: string,
): Promise<"applied" | "suggested" | "none"> {
  const candidates = await findMatchesForTransaction(txnId);
  if (candidates.length === 0) return "none";

  const top = candidates[0];
  const clearWinner = candidates.length === 1 || candidates[1].score <= top.score - 0.15;

  if (top.score >= MATCH.autoApplyScore && top.pending.coded && clearWinner) {
    const res = await applyPendingToTransaction(top.pendingExpenseId, top.transactionId, actorId, {
      auto: true,
    });
    return res.ok ? "applied" : "suggested";
  }

  return "suggested";
}
