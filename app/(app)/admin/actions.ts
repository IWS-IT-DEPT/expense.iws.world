"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  allocations,
  cardAccounts,
  cards,
  categories,
  dimensionMappings,
  entities,
  expenseItems,
  jobs,
  locations,
  merchants,
  mileageRates,
  pendingExpenses,
  policySettings,
  qboConnections,
  qboDimensions,
  qboExports,
  transactions,
  units,
  userRole,
  users,
} from "@/db/schema";
import { requireRole } from "@/lib/current-user";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const int = (fd: FormData, k: string) => {
  const n = Number.parseInt(str(fd, k), 10);
  return Number.isNaN(n) ? null : n;
};

async function done(path: string) {
  revalidatePath(path);
  revalidatePath("/admin");
}

/** True if any of the given `count(*)` selects returns a non-zero row. */
async function referenced(
  queries: PromiseLike<{ n: number }[]>[],
): Promise<boolean> {
  const results = await Promise.all(queries);
  return results.some((r) => Number(r[0]?.n ?? 0) > 0);
}

const countExpr = () => sql<number>`count(*)`;

/* -------------------------------------------------------------------- users */

export async function updateUser(fd: FormData) {
  await requireRole("admin");
  const id = str(fd, "id");
  const role = str(fd, "role");
  const allowed = userRole.enumValues as readonly string[];
  await db
    .update(users)
    .set({
      role: allowed.includes(role) ? (role as (typeof userRole.enumValues)[number]) : "cardholder",
      homeEntityId: opt(fd, "homeEntityId"),
      homeLocationId: opt(fd, "homeLocationId"),
      mileageEligible: bool(fd, "mileageEligible"),
      active: bool(fd, "active"),
    })
    .where(eq(users.id, id));
  await done("/admin/users");
}

export async function inviteUser(fd: FormData) {
  await requireRole("admin");
  const email = str(fd, "email").toLowerCase();
  if (!email) return;
  await db
    .insert(users)
    .values({ email, name: opt(fd, "name") ?? email, role: "cardholder" })
    .onConflictDoNothing({ target: users.email });
  await done("/admin/users");
}

/* ----------------------------------------------------------------- entities */

type CostingMode = "none" | "unit" | "job" | "unit_or_job";

export async function upsertEntity(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const common = {
    name: str(fd, "name"),
    legalName: opt(fd, "legalName"),
    costingMode: str(fd, "costingMode") as CostingMode,
    brandColor: opt(fd, "brandColor"),
    active: bool(fd, "active"),
  };
  if (id) {
    // `code` is immutable once set — QBO mappings and brand assets key off it.
    await db.update(entities).set(common).where(eq(entities.id, id));
  } else {
    const code = str(fd, "code").toUpperCase();
    if (!code || !common.name) return;
    await db.insert(entities).values({ ...common, code });
  }
  await done("/admin/entities");
}

export async function deleteEntity(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const inUse = await referenced([
    db.select({ n: countExpr() }).from(locations).where(eq(locations.homeEntityId, id)),
    db.select({ n: countExpr() }).from(units).where(eq(units.entityId, id)),
    db.select({ n: countExpr() }).from(jobs).where(eq(jobs.entityId, id)),
    db.select({ n: countExpr() }).from(cardAccounts).where(eq(cardAccounts.owningEntityId, id)),
    db.select({ n: countExpr() }).from(users).where(eq(users.homeEntityId, id)),
    db.select({ n: countExpr() }).from(allocations).where(eq(allocations.entityId, id)),
    db.select({ n: countExpr() }).from(expenseItems).where(eq(expenseItems.entityId, id)),
    db.select({ n: countExpr() }).from(pendingExpenses).where(eq(pendingExpenses.entityId, id)),
    db.select({ n: countExpr() }).from(qboConnections).where(eq(qboConnections.entityId, id)),
    db.select({ n: countExpr() }).from(qboDimensions).where(eq(qboDimensions.entityId, id)),
    db.select({ n: countExpr() }).from(dimensionMappings).where(eq(dimensionMappings.entityId, id)),
    db.select({ n: countExpr() }).from(qboExports).where(eq(qboExports.entityId, id)),
  ]);
  if (inUse) return;
  await db.delete(entities).where(eq(entities.id, id));
  await done("/admin/entities");
}

/* ---------------------------------------------------------------- locations */

export async function upsertLocation(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const values = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    homeEntityId: opt(fd, "homeEntityId"),
    active: bool(fd, "active"),
  };
  if (id) await db.update(locations).set(values).where(eq(locations.id, id));
  else await db.insert(locations).values(values);
  await done("/admin/locations");
}

export async function deleteLocation(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const inUse = await referenced([
    db.select({ n: countExpr() }).from(users).where(eq(users.homeLocationId, id)),
    db.select({ n: countExpr() }).from(allocations).where(eq(allocations.locationId, id)),
    db.select({ n: countExpr() }).from(expenseItems).where(eq(expenseItems.locationId, id)),
    db.select({ n: countExpr() }).from(pendingExpenses).where(eq(pendingExpenses.locationId, id)),
    db
      .select({ n: countExpr() })
      .from(dimensionMappings)
      .where(and(eq(dimensionMappings.localType, "location"), eq(dimensionMappings.localId, id))),
  ]);
  if (inUse) return;
  await db.delete(locations).where(eq(locations.id, id));
  await done("/admin/locations");
}

/* -------------------------------------------------------------------- units */

export async function upsertUnit(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const values = {
    entityId: str(fd, "entityId"),
    unitNumber: str(fd, "unitNumber"),
    description: opt(fd, "description"),
    type: str(fd, "type") as "truck" | "tractor" | "trailer" | "equipment" | "other",
    active: bool(fd, "active"),
  };
  if (id) await db.update(units).set(values).where(eq(units.id, id));
  else await db.insert(units).values(values);
  await done("/admin/units");
}

export async function deleteUnit(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const inUse = await referenced([
    db.select({ n: countExpr() }).from(allocations).where(eq(allocations.unitId, id)),
    db.select({ n: countExpr() }).from(expenseItems).where(eq(expenseItems.unitId, id)),
    db.select({ n: countExpr() }).from(pendingExpenses).where(eq(pendingExpenses.unitId, id)),
    db
      .select({ n: countExpr() })
      .from(dimensionMappings)
      .where(and(eq(dimensionMappings.localType, "unit"), eq(dimensionMappings.localId, id))),
  ]);
  if (inUse) return;
  await db.delete(units).where(eq(units.id, id));
  await done("/admin/units");
}

/* --------------------------------------------------------------------- jobs */

export async function upsertJob(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const values = {
    entityId: str(fd, "entityId"),
    jobNumber: str(fd, "jobNumber"),
    name: opt(fd, "name"),
    customerName: opt(fd, "customerName"),
    status: str(fd, "status") === "closed" ? ("closed" as const) : ("open" as const),
    active: bool(fd, "active"),
  };
  if (id) await db.update(jobs).set(values).where(eq(jobs.id, id));
  else await db.insert(jobs).values(values);
  await done("/admin/jobs");
}

export async function deleteJob(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const inUse = await referenced([
    db.select({ n: countExpr() }).from(allocations).where(eq(allocations.jobId, id)),
    db.select({ n: countExpr() }).from(expenseItems).where(eq(expenseItems.jobId, id)),
    db.select({ n: countExpr() }).from(pendingExpenses).where(eq(pendingExpenses.jobId, id)),
    db
      .select({ n: countExpr() })
      .from(dimensionMappings)
      .where(and(eq(dimensionMappings.localType, "job"), eq(dimensionMappings.localId, id))),
  ]);
  if (inUse) return;
  await db.delete(jobs).where(eq(jobs.id, id));
  await done("/admin/jobs");
}

/* --------------------------------------------------------------- categories */

export async function upsertCategory(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const values = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    requiresJobOrUnit: bool(fd, "requiresJobOrUnit"),
    receiptAlwaysRequired: bool(fd, "receiptAlwaysRequired"),
    sortOrder: int(fd, "sortOrder") ?? 100,
    active: bool(fd, "active"),
  };
  if (id) await db.update(categories).set(values).where(eq(categories.id, id));
  else await db.insert(categories).values(values);
  await done("/admin/categories");
}

export async function deleteCategory(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const inUse = await referenced([
    db.select({ n: countExpr() }).from(allocations).where(eq(allocations.categoryId, id)),
    db.select({ n: countExpr() }).from(expenseItems).where(eq(expenseItems.categoryId, id)),
    db.select({ n: countExpr() }).from(pendingExpenses).where(eq(pendingExpenses.categoryId, id)),
    db.select({ n: countExpr() }).from(merchants).where(eq(merchants.defaultCategoryId, id)),
    db
      .select({ n: countExpr() })
      .from(dimensionMappings)
      .where(and(eq(dimensionMappings.localType, "category"), eq(dimensionMappings.localId, id))),
  ]);
  if (inUse) return;
  await db.delete(categories).where(eq(categories.id, id));
  await done("/admin/categories");
}

/* -------------------------------------------------------------------- cards */

const CARD_NETWORKS = ["visa", "mastercard", "amex", "discover", "other"] as const;

/** Admin/finance add or edit of a card (typo fix / reassign / deactivate). */
export async function upsertCard(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const net = str(fd, "network");
  const values = {
    userId: opt(fd, "userId"),
    network: CARD_NETWORKS.includes(net as (typeof CARD_NETWORKS)[number])
      ? (net as (typeof CARD_NETWORKS)[number])
      : null,
    last4: str(fd, "last4"),
    displayName: opt(fd, "displayName"),
    active: bool(fd, "active"),
  };
  if (id) await db.update(cards).set(values).where(eq(cards.id, id));
  else {
    if (!values.last4) return;
    await db.insert(cards).values(values);
  }
  await done("/admin/cards");
}

export async function deleteCard(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const inUse = await referenced([
    db.select({ n: countExpr() }).from(transactions).where(eq(transactions.cardId, id)),
    db.select({ n: countExpr() }).from(pendingExpenses).where(eq(pendingExpenses.cardId, id)),
  ]);
  if (inUse) return;
  await db.delete(cards).where(eq(cards.id, id));
  await done("/admin/cards");
}

/* ------------------------------------------------------------------ mileage */

export async function upsertMileageRate(fd: FormData) {
  await requireRole("admin");
  const id = opt(fd, "id");
  const values = {
    effectiveDate: str(fd, "effectiveDate"),
    ratePerMile: str(fd, "ratePerMile"),
    source: str(fd, "source") || "IRS",
    note: opt(fd, "note"),
  };
  if (id) await db.update(mileageRates).set(values).where(eq(mileageRates.id, id));
  else await db.insert(mileageRates).values(values);
  await done("/admin/mileage");
}

/** Remove a rate — only when no mileage line references it (kept for the audit). */
export async function deleteMileageRate(fd: FormData) {
  await requireRole("admin");
  const id = str(fd, "id");
  if (!id) return;
  const [used] = await db
    .select({ n: sql<number>`count(*)` })
    .from(expenseItems)
    .where(eq(expenseItems.mileageRateId, id));
  if (Number(used.n) > 0) return; // in use — leave it alone
  await db.delete(mileageRates).where(eq(mileageRates.id, id));
  await done("/admin/mileage");
}

/* ------------------------------------------------------------------- policy */

export async function updatePolicy(fd: FormData) {
  const user = await requireRole("admin");
  const dollars = int(fd, "receipt_threshold");
  if (dollars == null || dollars < 0) return;
  await db
    .insert(policySettings)
    .values({
      key: "receipt_threshold_cents",
      value: dollars * 100,
      description: "Receipt required at/above this amount",
      updatedById: user.id,
    })
    .onConflictDoUpdate({
      target: policySettings.key,
      set: { value: dollars * 100, updatedAt: new Date(), updatedById: user.id },
    });
  await done("/admin/policy");
}
