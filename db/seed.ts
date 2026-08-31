import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { sql } from "drizzle-orm";

import {
  cardAccounts,
  categories,
  entities,
  locations,
  mileageRates,
  policySettings,
} from "./schema";

/**
 * Seeds reference data: the 6 entities, their sites, the 3 card programs, a
 * starter chart of expense categories, mileage rate and default policy.
 * Idempotent — safe to re-run. Run with:  npm run db:seed
 */

async function seed() {
  // Dynamic import so dotenv runs before db/index.ts reads DATABASE_URL.
  const { db } = await import("./index");

  console.log("Seeding entities...");
  // brandColor: accent for entity badges, sampled from each company logo.
  // logoPath: drop the matching PNG (transparent) into /public/brand/ — see
  // public/brand/README.md. IWS is already in place.
  const entityRows = [
    { code: "IWS", name: "IWS", legalName: "International Warehousing & Shipping, LLC", costingMode: "none" as const, brandColor: "#2F9E5A", logoPath: "/brand/iws.png" },
    { code: "PRE", name: "Precision Construction Repair", legalName: "Precision Construction Repair, LLC", costingMode: "job" as const, brandColor: "#4B5563", logoPath: "/brand/pre.png" },
    { code: "PORT", name: "Port City Repair", legalName: "Port City Repair, LLC", costingMode: "unit" as const, brandColor: "#3B2A1E", logoPath: "/brand/port.png" },
    { code: "RGT", name: "Rolling Green Transportation", legalName: "Rolling Green Transportation, LLC", costingMode: "unit" as const, brandColor: "#2E7D32", logoPath: "/brand/rgt.png" },
    { code: "RGL", name: "Rolling Green Logistics", legalName: "Rolling Green Logistics, LLC", costingMode: "none" as const, brandColor: "#4A8A96", logoPath: "/brand/rgl.png" },
    { code: "GGB", name: "Gravel Grabbers", legalName: "Gravel Grabbers, LLC", costingMode: "unit" as const, brandColor: "#1B3A6B", logoPath: "/brand/ggb.png" },
  ];
  await db
    .insert(entities)
    .values(entityRows)
    .onConflictDoUpdate({
      target: entities.code,
      set: {
        brandColor: sql`excluded.brand_color`,
        logoPath: sql`excluded.logo_path`,
        costingMode: sql`excluded.costing_mode`,
      },
    });
  const entityByCode = Object.fromEntries(
    (await db.query.entities.findMany()).map((e) => [e.code, e.id]),
  ) as Record<string, string>;

  console.log("Seeding locations...");
  // NOTE: "Brookley" is the corrected spelling of the Mobile, AL aeroplex.
  const locationRows = [
    { code: "CONC", name: "Conception Street Warehouse", home: "IWS" },
    { code: "BRK1", name: "Brookley Warehouse 1", home: "IWS" },
    { code: "BRK2", name: "Brookley Warehouse 2", home: "IWS" },
    { code: "PNS1", name: "Pensacola Warehouse 1", home: "IWS" },
    { code: "HOU1", name: "Houston Warehouse 1", home: "IWS" },
    { code: "LOX1", name: "Loxley Warehouse 1", home: "IWS" },
    { code: "MAIN", name: "Main Office", home: "IWS" }, // Rolling Green teams work from here
    { code: "PRE-SHOP", name: "Precision Shop", home: "PRE" },
    { code: "PORT-SHOP", name: "Port City Shop", home: "PORT" },
    { code: "GGB-YARD", name: "Gravel Grabbers Yard", home: "GGB" },
  ];
  await db
    .insert(locations)
    .values(
      locationRows.map((l) => ({
        code: l.code,
        name: l.name,
        homeEntityId: entityByCode[l.home],
      })),
    )
    .onConflictDoNothing({ target: locations.code });

  console.log("Seeding card accounts...");
  await db
    .insert(cardAccounts)
    .values([
      { name: "Capital One — IWS", issuer: "capital_one", importProfile: "capital_one", owningEntityId: entityByCode.IWS },
      { name: "Capital One — Precision Construction Repair", issuer: "capital_one", importProfile: "capital_one", owningEntityId: entityByCode.PRE },
      { name: "American Express — Rolling Green Transportation", issuer: "amex", importProfile: "amex", owningEntityId: entityByCode.RGT },
    ])
    .onConflictDoNothing();

  console.log("Seeding categories...");
  const categoryRows = [
    { code: "FUEL", name: "Fuel", requiresJobOrUnit: true, sortOrder: 10 },
    { code: "MAINT", name: "Vehicle Maintenance & Repair", requiresJobOrUnit: true, sortOrder: 20 },
    { code: "PARTS", name: "Parts & Materials", sortOrder: 30 },
    { code: "TOOLS", name: "Tools & Small Equipment", sortOrder: 40 },
    { code: "SHOP", name: "Shop Supplies", sortOrder: 50 },
    { code: "SAFETY", name: "Safety & PPE", sortOrder: 60 },
    { code: "UNIFORM", name: "Uniforms & Laundry", sortOrder: 70 },
    { code: "FREIGHT", name: "Freight & Shipping", sortOrder: 80 },
    { code: "TOLLS", name: "Tolls & Parking", sortOrder: 90 },
    { code: "MEALS", name: "Meals", receiptAlwaysRequired: true, sortOrder: 100 },
    { code: "LODGING", name: "Lodging", receiptAlwaysRequired: true, sortOrder: 110 },
    { code: "TRAVEL", name: "Travel (Airfare, Rental, Rideshare)", receiptAlwaysRequired: true, sortOrder: 120 },
    { code: "OFFICE", name: "Office Supplies", sortOrder: 130 },
    { code: "SOFTWARE", name: "Software & Subscriptions", sortOrder: 140 },
    { code: "TRAINING", name: "Training & Certifications", sortOrder: 150 },
    { code: "DUES", name: "Dues & Memberships", sortOrder: 160 },
    { code: "UTIL", name: "Utilities", sortOrder: 170 },
    { code: "MILEAGE", name: "Mileage", sortOrder: 200 },
    { code: "MISC", name: "Other (explain in purpose)", sortOrder: 999 },
  ];
  await db.insert(categories).values(categoryRows).onConflictDoNothing({ target: categories.code });

  console.log("Seeding mileage rates...");
  // TODO: CONFIRM the current IRS standard mileage rate and correct these rows.
  // 2025 business rate was $0.70/mile. The 2026 row is a PLACEHOLDER.
  await db
    .insert(mileageRates)
    .values([
      { effectiveDate: "2025-01-01", ratePerMile: "0.7000", source: "IRS", note: "2025 business rate" },
      { effectiveDate: "2026-01-01", ratePerMile: "0.7000", source: "IRS", note: "PLACEHOLDER — confirm 2026 rate" },
    ])
    .onConflictDoNothing({ target: mileageRates.effectiveDate });

  console.log("Seeding policy...");
  await db
    .insert(policySettings)
    .values([
      { key: "receipt_threshold_cents", value: 7500, description: "Receipt required at/above this charge amount" },
      { key: "review_threshold_cents", value: 50000, description: "Charges at/above this always surface for review" },
      { key: "weekly_report_due_dow", value: 1, description: "Day of week weekly reports are due (0=Sun)" },
      { key: "auto_approve_clean", value: false, description: "Auto-approve items with no flags (off until Allie opts in)" },
    ])
    .onConflictDoNothing({ target: policySettings.key });

  console.log("Done.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
