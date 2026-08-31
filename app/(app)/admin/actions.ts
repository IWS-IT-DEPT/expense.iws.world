"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  cardAccounts,
  cards,
  categories,
  entities,
  jobs,
  locations,
  mileageRates,
  policySettings,
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

export async function updateEntity(fd: FormData) {
  await requireRole("admin");
  await db
    .update(entities)
    .set({
      name: str(fd, "name"),
      legalName: opt(fd, "legalName"),
      costingMode: str(fd, "costingMode") as "none" | "unit" | "job" | "unit_or_job",
      brandColor: opt(fd, "brandColor"),
      active: bool(fd, "active"),
    })
    .where(eq(entities.id, str(fd, "id")));
  await done("/admin/entities");
}

/* ---------------------------------------------------------------- locations */

export async function upsertLocation(fd: FormData) {
  await requireRole("admin");
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

/* -------------------------------------------------------------------- units */

export async function upsertUnit(fd: FormData) {
  await requireRole("admin");
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

/* --------------------------------------------------------------------- jobs */

export async function upsertJob(fd: FormData) {
  await requireRole("admin");
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

/* --------------------------------------------------------------- categories */

export async function upsertCategory(fd: FormData) {
  await requireRole("admin");
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

/* -------------------------------------------------------------------- cards */

export async function updateCardAccount(fd: FormData) {
  await requireRole("admin");
  await db
    .update(cardAccounts)
    .set({ name: str(fd, "name"), owningEntityId: str(fd, "owningEntityId"), active: bool(fd, "active") })
    .where(eq(cardAccounts.id, str(fd, "id")));
  await done("/admin/cards");
}

export async function upsertCard(fd: FormData) {
  await requireRole("admin");
  const id = opt(fd, "id");
  const values = {
    cardAccountId: str(fd, "cardAccountId"),
    userId: opt(fd, "userId"),
    last4: str(fd, "last4"),
    displayName: opt(fd, "displayName"),
    active: bool(fd, "active"),
  };
  if (id) await db.update(cards).set(values).where(eq(cards.id, id));
  else await db.insert(cards).values(values);
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

/* ------------------------------------------------------------------- policy */

export async function updatePolicy(fd: FormData) {
  const user = await requireRole("admin");
  // the two *_cents fields are entered in dollars on the form
  const fields: Record<string, number> = {
    receipt_threshold_cents: 100,
    review_threshold_cents: 100,
    weekly_report_due_dow: 1,
  };
  for (const [key, mult] of Object.entries(fields)) {
    const raw = int(fd, key);
    if (raw == null) continue;
    await db
      .update(policySettings)
      .set({ value: raw * mult, updatedAt: new Date(), updatedById: user.id })
      .where(eq(policySettings.key, key));
  }
  await db
    .update(policySettings)
    .set({ value: bool(fd, "auto_approve_clean"), updatedAt: new Date(), updatedById: user.id })
    .where(eq(policySettings.key, "auto_approve_clean"));
  await done("/admin/policy");
}
