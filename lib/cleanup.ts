import { count, eq, inArray, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  allocations,
  approvals,
  cards,
  exceptionFlags,
  entityQboSettings,
  expenseItems,
  expenseReports,
  pendingExpenses,
  policySettings,
  pushSubscriptions,
  qboConnections,
  qboExports,
  receiptUploadSessions,
  receipts,
  reimbursementBatches,
  reminderSends,
  transactions,
  users,
} from "@/db/schema";

import { blobStore } from "./storage";

/**
 * Go-live cleanup: permanently remove test users and/or their expenses.
 *
 * The Neon HTTP driver has no transactions, so this is a sequence of statements
 * ordered so that an interruption leaves nothing dangling — and re-running it
 * finishes the job. Receipt FILES (Vercel Blob) are deleted first, since the
 * database cascade can't reach them.
 */

export interface UserDataCounts {
  userId: string;
  cardExpenses: number;
  items: number;
  reports: number;
  receipts: number;
  cards: number;
}

export interface CleanupResult {
  users: number;
  cardExpenses: number;
  items: number;
  reports: number;
  receipts: number;
}

const idsOf = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);

/** `inArray` that tolerates an empty list (matches nothing). */
function anyOf(col: AnyPgColumn, ids: string[]): SQL | undefined {
  return ids.length ? inArray(col, ids) : undefined;
}

/** What each user has, for the preview on the cleanup page. */
export async function countsByUser(): Promise<Map<string, UserDataCounts>> {
  const [pe, it, rep, rcPe, rcIt, cd] = await Promise.all([
    db.select({ u: pendingExpenses.userId, n: count() }).from(pendingExpenses).groupBy(pendingExpenses.userId),
    db.select({ u: expenseItems.userId, n: count() }).from(expenseItems).groupBy(expenseItems.userId),
    db.select({ u: expenseReports.userId, n: count() }).from(expenseReports).groupBy(expenseReports.userId),
    db
      .select({ u: pendingExpenses.userId, n: count() })
      .from(receipts)
      .innerJoin(pendingExpenses, eq(receipts.pendingExpenseId, pendingExpenses.id))
      .groupBy(pendingExpenses.userId),
    db
      .select({ u: expenseItems.userId, n: count() })
      .from(receipts)
      .innerJoin(expenseItems, eq(receipts.expenseItemId, expenseItems.id))
      .groupBy(expenseItems.userId),
    db.select({ u: cards.userId, n: count() }).from(cards).groupBy(cards.userId),
  ]);

  const out = new Map<string, UserDataCounts>();
  const get = (u: string | null) => {
    if (!u) return null;
    if (!out.has(u)) out.set(u, { userId: u, cardExpenses: 0, items: 0, reports: 0, receipts: 0, cards: 0 });
    return out.get(u)!;
  };
  for (const r of pe) { const c = get(r.u); if (c) c.cardExpenses = r.n; }
  for (const r of it) { const c = get(r.u); if (c) c.items = r.n; }
  for (const r of rep) { const c = get(r.u); if (c) c.reports = r.n; }
  for (const r of rcPe) { const c = get(r.u); if (c) c.receipts += r.n; }
  for (const r of rcIt) { const c = get(r.u); if (c) c.receipts += r.n; }
  for (const r of cd) { const c = get(r.u); if (c) c.cards = r.n; }
  return out;
}

/** Delete receipt files from storage, a few at a time; a missing file is not an error. */
async function deleteBlobs(keys: string[]) {
  for (let i = 0; i < keys.length; i += 10) {
    await Promise.all(keys.slice(i, i + 10).map((k) => blobStore.delete(k).catch(() => {})));
  }
}

/** Remove every expense, report and receipt belonging to these users (accounts stay). */
export async function deleteExpensesOf(userIds: string[]): Promise<Omit<CleanupResult, "users">> {
  if (userIds.length === 0) return { cardExpenses: 0, items: 0, reports: 0, receipts: 0 };

  const [pend, items, reps] = await Promise.all([
    db.select({ id: pendingExpenses.id }).from(pendingExpenses).where(inArray(pendingExpenses.userId, userIds)),
    db.select({ id: expenseItems.id }).from(expenseItems).where(inArray(expenseItems.userId, userIds)),
    db.select({ id: expenseReports.id }).from(expenseReports).where(inArray(expenseReports.userId, userIds)),
  ]);
  const pendIds = idsOf(pend);
  const itemIds = idsOf(items);
  const repIds = idsOf(reps);

  // 1. receipt files + rows
  const recWhere = or(anyOf(receipts.pendingExpenseId, pendIds), anyOf(receipts.expenseItemId, itemIds));
  const recs = recWhere ? await db.select({ id: receipts.id, key: receipts.blobKey }).from(receipts).where(recWhere) : [];
  await deleteBlobs(recs.map((r) => r.key));
  if (recWhere) await db.delete(receipts).where(recWhere);

  // 2. things that point at the expenses
  await db.delete(receiptUploadSessions).where(inArray(receiptUploadSessions.userId, userIds));
  const subjectIds = [...pendIds, ...itemIds, ...repIds];
  const subj = anyOf(approvals.subjectId, subjectIds);
  if (subj) await db.delete(approvals).where(subj);
  const exp = anyOf(qboExports.subjectId, subjectIds);
  if (exp) await db.delete(qboExports).where(exp);
  const flags = anyOf(exceptionFlags.expenseItemId, itemIds);
  if (flags) await db.delete(exceptionFlags).where(flags);

  // 3. the expenses themselves, then the reports they were bundled into
  const dropItems = anyOf(expenseItems.id, itemIds);
  if (dropItems) await db.delete(expenseItems).where(dropItems);
  const dropPend = anyOf(pendingExpenses.id, pendIds);
  if (dropPend) await db.delete(pendingExpenses).where(dropPend);
  const dropReps = anyOf(expenseReports.id, repIds);
  if (dropReps) await db.delete(expenseReports).where(dropReps);

  return { cardExpenses: pendIds.length, items: itemIds.length, reports: repIds.length, receipts: recs.length };
}

/** Remove these accounts and everything they did. Never call with the signed-in admin. */
export async function deleteUsersAndData(userIds: string[]): Promise<CleanupResult> {
  if (userIds.length === 0) return { users: 0, cardExpenses: 0, items: 0, reports: 0, receipts: 0 };

  const gone = await deleteExpensesOf(userIds);

  // Receipts these users uploaded onto someone else's expense (e.g. a reviewer).
  const stray = await db
    .select({ id: receipts.id, key: receipts.blobKey })
    .from(receipts)
    .where(inArray(receipts.uploadedById, userIds));
  await deleteBlobs(stray.map((r) => r.key));
  if (stray.length) await db.delete(receipts).where(inArray(receipts.uploadedById, userIds));

  // Their own bookkeeping.
  await db.delete(approvals).where(inArray(approvals.actorId, userIds));
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  await db.delete(reminderSends).where(inArray(reminderSends.userId, userIds));
  await db.delete(cards).where(inArray(cards.userId, userIds));

  // Other people's records that merely mention them: keep the record, clear the name.
  await db.update(expenseReports).set({ reviewedById: null }).where(inArray(expenseReports.reviewedById, userIds));
  await db.update(expenseReports).set({ approvedById: null }).where(inArray(expenseReports.approvedById, userIds));
  await db.update(pendingExpenses).set({ reconciledById: null }).where(inArray(pendingExpenses.reconciledById, userIds));
  await db.update(pendingExpenses).set({ approvedById: null }).where(inArray(pendingExpenses.approvedById, userIds));
  await db.update(pendingExpenses).set({ matchedById: null }).where(inArray(pendingExpenses.matchedById, userIds));
  await db.update(pendingExpenses).set({ createdById: null }).where(inArray(pendingExpenses.createdById, userIds));
  await db.update(exceptionFlags).set({ resolvedById: null }).where(inArray(exceptionFlags.resolvedById, userIds));
  await db.update(policySettings).set({ updatedById: null }).where(inArray(policySettings.updatedById, userIds));
  await db.update(entityQboSettings).set({ updatedById: null }).where(inArray(entityQboSettings.updatedById, userIds));
  await db.update(qboConnections).set({ connectedById: null }).where(inArray(qboConnections.connectedById, userIds));
  await db.update(qboExports).set({ createdById: null }).where(inArray(qboExports.createdById, userIds));
  await db.update(reimbursementBatches).set({ exportedById: null }).where(inArray(reimbursementBatches.exportedById, userIds));
  await db.update(transactions).set({ assignedUserId: null }).where(inArray(transactions.assignedUserId, userIds));
  await db.update(transactions).set({ importedById: null }).where(inArray(transactions.importedById, userIds));
  await db.update(allocations).set({ createdById: null }).where(inArray(allocations.createdById, userIds));
  await db.update(cards).set({ requestedById: null }).where(inArray(cards.requestedById, userIds));

  await db.delete(users).where(inArray(users.id, userIds));

  return { users: userIds.length, ...gone, receipts: gone.receipts + stray.length };
}
