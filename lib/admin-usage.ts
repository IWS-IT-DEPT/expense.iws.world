/**
 * "Is this dimension row referenced anywhere?" lookups for the Settings tables.
 *
 * Each helper returns the set of ids that are pointed at by expense history,
 * config, or QBO mappings — the Settings pages use it to show a Delete button
 * only for rows that are safe to hard-delete. The matching `delete*` server
 * actions in `app/(app)/admin/actions.ts` re-check server-side.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  allocations,
  cardAccounts,
  dimensionMappings,
  expenseItems,
  jobs,
  locations,
  merchants,
  pendingExpenses,
  qboConnections,
  qboDimensions,
  qboExports,
  transactions,
  units,
  users,
} from "@/db/schema";

async function collect(
  queries: PromiseLike<{ id: string | null }[]>[],
): Promise<Set<string>> {
  const results = await Promise.all(queries);
  const seen = new Set<string>();
  for (const rows of results) {
    for (const r of rows) if (r.id) seen.add(r.id);
  }
  return seen;
}

const mappingIds = (localType: string) =>
  db
    .selectDistinct({ id: dimensionMappings.localId })
    .from(dimensionMappings)
    .where(eq(dimensionMappings.localType, localType));

export function usedEntityIds(): Promise<Set<string>> {
  return collect([
    db.selectDistinct({ id: locations.homeEntityId }).from(locations),
    db.selectDistinct({ id: units.entityId }).from(units),
    db.selectDistinct({ id: jobs.entityId }).from(jobs),
    db.selectDistinct({ id: cardAccounts.owningEntityId }).from(cardAccounts),
    db.selectDistinct({ id: users.homeEntityId }).from(users),
    db.selectDistinct({ id: allocations.entityId }).from(allocations),
    db.selectDistinct({ id: expenseItems.entityId }).from(expenseItems),
    db.selectDistinct({ id: pendingExpenses.entityId }).from(pendingExpenses),
    db.selectDistinct({ id: qboConnections.entityId }).from(qboConnections),
    db.selectDistinct({ id: qboDimensions.entityId }).from(qboDimensions),
    db.selectDistinct({ id: dimensionMappings.entityId }).from(dimensionMappings),
    db.selectDistinct({ id: qboExports.entityId }).from(qboExports),
  ]);
}

export function usedLocationIds(): Promise<Set<string>> {
  return collect([
    db.selectDistinct({ id: users.homeLocationId }).from(users),
    db.selectDistinct({ id: allocations.locationId }).from(allocations),
    db.selectDistinct({ id: expenseItems.locationId }).from(expenseItems),
    db.selectDistinct({ id: pendingExpenses.locationId }).from(pendingExpenses),
    mappingIds("location"),
  ]);
}

export function usedUnitIds(): Promise<Set<string>> {
  return collect([
    db.selectDistinct({ id: allocations.unitId }).from(allocations),
    db.selectDistinct({ id: expenseItems.unitId }).from(expenseItems),
    db.selectDistinct({ id: pendingExpenses.unitId }).from(pendingExpenses),
    mappingIds("unit"),
  ]);
}

export function usedJobIds(): Promise<Set<string>> {
  return collect([
    db.selectDistinct({ id: allocations.jobId }).from(allocations),
    db.selectDistinct({ id: expenseItems.jobId }).from(expenseItems),
    db.selectDistinct({ id: pendingExpenses.jobId }).from(pendingExpenses),
    mappingIds("job"),
  ]);
}

export function usedCategoryIds(): Promise<Set<string>> {
  return collect([
    db.selectDistinct({ id: allocations.categoryId }).from(allocations),
    db.selectDistinct({ id: expenseItems.categoryId }).from(expenseItems),
    db.selectDistinct({ id: pendingExpenses.categoryId }).from(pendingExpenses),
    db.selectDistinct({ id: merchants.defaultCategoryId }).from(merchants),
    mappingIds("category"),
  ]);
}

export function usedCardIds(): Promise<Set<string>> {
  return collect([
    db.selectDistinct({ id: transactions.cardId }).from(transactions),
    db.selectDistinct({ id: pendingExpenses.cardId }).from(pendingExpenses),
  ]);
}
