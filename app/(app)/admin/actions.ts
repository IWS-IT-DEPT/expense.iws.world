"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  allocations,
  cards,
  categories,
  dimensionMappings,
  entities,
  entityQboSettings,
  expenseItems,
  jobs,
  locations,
  merchants,
  mileageRates,
  pendingExpenses,
  policySettings,
  qboConnections,
  qboDimensions,
  transactions,
  units,
  userRole,
  users,
} from "@/db/schema";
import { entityBlockers } from "@/lib/admin-usage";
import { GROUP_DRIVEN, GROUP_SYNC_ENABLED, requireRole } from "@/lib/current-user";
import { notifyWelcome } from "@/lib/notify";

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
  const me = await requireRole("admin");
  const id = str(fd, "id");
  if (!id) return;
  const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!existing) return;

  const allowed = userRole.enumValues as readonly string[];
  const requestedRole = str(fd, "role");
  let role = (allowed.includes(requestedRole) ? requestedRole : existing.role) as (typeof userRole.enumValues)[number];
  let active = bool(fd, "active");

  if (me.id === existing.id) {
    // Never let an admin lock themselves (or everyone) out.
    role = existing.role;
    active = true;
  }
  // With Entra group sync on, these roles belong to the groups — a hand-set one is reset on next login.
  if (GROUP_SYNC_ENABLED && role !== existing.role && (GROUP_DRIVEN.includes(role) || GROUP_DRIVEN.includes(existing.role))) {
    role = existing.role;
  }

  // Risky changes need the person's email typed (the form asks; enforced here too).
  const deactivating = existing.active && !active;
  const adminChange = role !== existing.role && (role === "admin" || existing.role === "admin");
  if ((deactivating || adminChange) && str(fd, "confirmEmail").toLowerCase() !== existing.email) return;

  const name = str(fd, "name");
  await db
    .update(users)
    .set({
      ...(name ? { name } : {}),
      role,
      homeEntityId: opt(fd, "homeEntityId"),
      homeLocationId: opt(fd, "homeLocationId"),
      mileageEligible: bool(fd, "mileageEligible"),
      active,
    })
    .where(eq(users.id, id));
  revalidatePath(`/admin/users/${id}`);
  await done("/admin/users");
}

export async function inviteUser(fd: FormData) {
  await requireRole("admin");
  const email = str(fd, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) redirect(`/admin/users/${existing.id}`);

  const [created] = await db
    .insert(users)
    .values({ email, name: opt(fd, "name") ?? email, role: "cardholder" })
    .returning({ id: users.id });
  const welcomed = bool(fd, "sendWelcome") ? await notifyWelcome(created.id) : false;
  await done("/admin/users");
  redirect(`/admin/users/${created.id}${welcomed ? "?welcome=sent" : ""}`);
}

/** Re-send the setup email (they lost it, or it went to junk). */
export async function resendWelcome(fd: FormData) {
  await requireRole("admin");
  const id = str(fd, "id");
  if (!id) return;
  const sent = await notifyWelcome(id);
  redirect(`/admin/users/${id}${sent ? "?welcome=sent" : ""}`);
}

/* ----------------------------------------------------------------- entities */

/** Short, uppercase, label-safe: letters, digits, dash, underscore. */
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;

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
    // Everything keys off the entity's id, so the code is just a label and safe to edit.
    const code = str(fd, "code").toUpperCase();
    const current = await db.query.entities.findFirst({ where: eq(entities.id, id) });
    if (!current) return;
    if (code && code !== current.code) {
      // Renaming is a deliberate act: the form makes you type the current code.
      if (str(fd, "confirmCodeChange").toUpperCase() !== current.code) return;
      if (!CODE_RE.test(code)) return;
      const clash = await db.query.entities.findFirst({ where: eq(entities.code, code) });
      if (clash && clash.id !== id) return;
      await db.update(entities).set({ ...common, code }).where(eq(entities.id, id));
    } else {
      await db.update(entities).set(common).where(eq(entities.id, id));
    }
  } else {
    const code = str(fd, "code").toUpperCase();
    if (!CODE_RE.test(code) || !common.name) return;
    const clash = await db.query.entities.findFirst({ where: eq(entities.code, code) });
    if (clash) return;
    const [created] = await db.insert(entities).values({ ...common, code }).returning({ id: entities.id });
    await done("/admin/entities");
    redirect(`/admin/entities/${created.id}`);
  }
  await done("/admin/entities");
  revalidatePath(`/admin/entities/${id}`);
}

export async function deleteEntity(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const entity = await db.query.entities.findFirst({ where: eq(entities.id, id) });
  if (!entity) return;
  // Typed confirmation, enforced here as well as in the form.
  if (str(fd, "confirm") !== `delete ${entity.code}`) return;
  // Re-checked here, not just on the page: history means retire, don't delete.
  if ((await entityBlockers(id)).length > 0) return;

  // QuickBooks setup belongs to the entity and goes with it.
  await db.delete(dimensionMappings).where(eq(dimensionMappings.entityId, id));
  await db.delete(qboDimensions).where(eq(qboDimensions.entityId, id));
  await db.delete(qboConnections).where(eq(qboConnections.entityId, id));
  await db.delete(entityQboSettings).where(eq(entityQboSettings.entityId, id));
  await db.delete(entities).where(eq(entities.id, id));
  await done("/admin/entities");
  redirect("/admin/entities");
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
  await requireRole("admin", "payroll");
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
  await requireRole("admin", "payroll");
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

/* ------------------------------------------------------------- QuickBooks -- */

const QBO_ID_RE = /^[A-Za-z0-9_.:-]{1,40}$/;

function qboId(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return QBO_ID_RE.test(v) ? v : null;
}

/** Per-entity QuickBooks company settings (no secrets). */
export async function saveQboSettings(fd: FormData) {
  const user = await requireRole("admin", "accounting");
  const entityId = str(fd, "entityId");
  if (!entityId) return;
  const realm = str(fd, "realmId");
  const pick = <T extends string>(k: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(str(fd, k)) ? (str(fd, k) as T) : fallback;

  const values = {
    realmId: /^\d{5,20}$/.test(realm) ? realm : null,
    companyName: opt(fd, "companyName"),
    environment: pick("environment", ["sandbox", "production"], "sandbox"),
    enabled: bool(fd, "enabled"),
    exportTrigger: pick("exportTrigger", ["manual", "on_approval"], "manual"),
    usesClasses: bool(fd, "usesClasses"),
    usesLocations: bool(fd, "usesLocations"),
    jobsAs: pick("jobsAs", ["project", "customer"], "project"),
    cardAccountQboId: qboId(fd, "cardAccountQboId"),
    cardAccountName: opt(fd, "cardAccountName"),
    apAccountQboId: qboId(fd, "apAccountQboId"),
    apAccountName: opt(fd, "apAccountName"),
    defaultVendorQboId: qboId(fd, "defaultVendorQboId"),
    defaultVendorName: opt(fd, "defaultVendorName"),
    notes: opt(fd, "notes"),
    updatedAt: new Date(),
    updatedById: user.id,
  };
  // Never leave an entity "enabled" without a company file to export to.
  if (!values.realmId) values.enabled = false;

  await db
    .insert(entityQboSettings)
    .values({ entityId, ...values })
    .onConflictDoUpdate({ target: entityQboSettings.entityId, set: values });
  revalidatePath(`/admin/entities/${entityId}/quickbooks`);
  revalidatePath("/admin/entities");
}

const MAP_TYPES = ["location", "unit", "job", "category", "card", "user"] as const;
const MAP_DIM = {
  location: "location",
  unit: "class",
  job: "customer",
  category: "account",
  card: "account",
  user: "vendor",
} as const;

/**
 * Save this entity's QBO id mappings. Fields are `map:<localType>:<localId>`;
 * a blank value clears the mapping. Only rows that changed are written.
 */
export async function saveQboMappings(fd: FormData) {
  await requireRole("admin", "accounting");
  const entityId = str(fd, "entityId");
  if (!entityId) return;

  const wanted = new Map<string, string>(); // "type:id" -> qbo id ("" = clear)
  for (const [k, v] of fd.entries()) {
    const m = /^map:([a-z]+):([0-9a-f-]{36})$/.exec(k);
    if (!m || !(MAP_TYPES as readonly string[]).includes(m[1])) continue;
    const val = String(v).trim();
    if (val && !QBO_ID_RE.test(val)) continue;
    wanted.set(`${m[1]}:${m[2]}`, val);
  }

  const existing = await db.query.dimensionMappings.findMany({
    where: eq(dimensionMappings.entityId, entityId),
  });
  const have = new Map(existing.map((e) => [`${e.localType}:${e.localId}`, e]));

  const toClear: string[] = [];
  for (const [key, val] of wanted) {
    const cur = have.get(key);
    const [type, localId] = key.split(":") as [(typeof MAP_TYPES)[number], string];
    if (!val) {
      if (cur) toClear.push(cur.id);
    } else if (!cur || cur.qboId !== val) {
      await db
        .insert(dimensionMappings)
        .values({ entityId, localType: type, localId, qboDimType: MAP_DIM[type], qboId: val })
        .onConflictDoUpdate({
          target: [dimensionMappings.entityId, dimensionMappings.localType, dimensionMappings.localId],
          set: { qboId: val, updatedAt: new Date() },
        });
    }
  }
  if (toClear.length) await db.delete(dimensionMappings).where(inArray(dimensionMappings.id, toClear));
  revalidatePath(`/admin/entities/${entityId}/quickbooks`);
}
