import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { eq, inArray } from "drizzle-orm";

import {
  approvals,
  cards,
  categories,
  entities,
  expenseItems,
  expenseReports,
  locations,
  pendingExpenses,
  reminderSends,
  users,
} from "./schema";

/**
 * Demo data for the testing phase: a handful of cardholders with cards, expenses
 * in every workflow state, and a couple of weekly reports.
 *
 *   npm run db:seed:test          seed
 *   npm run db:seed:test -- wipe   remove the demo rows and stop
 *
 * Demo users have emails demo.*@iws.world and no Entra oid (they can't sign in;
 * they exist so accounting / approver / dashboard views have something to show).
 */

const DEMO = [
  { key: "jordan", name: "Jordan Demo", network: "visa" as const, last4: "1001", nick: "Fuel card" },
  { key: "sam", name: "Sam Demo", network: "mastercard" as const, last4: "1002", nick: "Shop card" },
  { key: "riley", name: "Riley Demo", network: "amex" as const, last4: "1003", nick: null },
  { key: "casey", name: "Casey Demo", network: "visa" as const, last4: "1004", nick: "Truck 12" },
];

function iso(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { db } = await import("./index");
  const wipe = process.argv.includes("wipe");

  const demoUsers = await db.query.users.findMany({
    where: (u, { like }) => like(u.email, "demo.%@iws.world"),
  });
  const ids = demoUsers.map((u) => u.id);

  if (ids.length) {
    console.log(`Removing ${ids.length} existing demo users and their data...`);
    await db.delete(approvals).where(inArray(approvals.actorId, ids));
    await db.delete(reminderSends).where(inArray(reminderSends.userId, ids));
    await db.delete(pendingExpenses).where(inArray(pendingExpenses.userId, ids));
    await db.delete(expenseItems).where(inArray(expenseItems.userId, ids));
    await db.delete(expenseReports).where(inArray(expenseReports.userId, ids));
    await db.delete(cards).where(inArray(cards.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  if (wipe) {
    console.log("Wiped.");
    return;
  }

  // reference data
  const [entityRows, locationRows, categoryRows, rate] = await Promise.all([
    db.query.entities.findMany({ where: eq(entities.active, true) }),
    db.query.locations.findMany({ where: eq(locations.active, true) }),
    db.query.categories.findMany({ where: eq(categories.active, true) }),
    db.query.mileageRates.findFirst({ orderBy: (t, { desc }) => [desc(t.effectiveDate)] }),
  ]);
  const ent = (code: string) => entityRows.find((e) => e.code === code) ?? entityRows[0];
  const loc = locationRows.find((l) => l.code === "MAIN") ?? locationRows[0];
  const cat = (code: string) => categoryRows.find((c) => c.code === code) ?? categoryRows[0];
  const fuel = cat("FUEL");
  const parts = cat("PARTS");
  const meals = cat("MEALS");
  const mileageCat = cat("MILEAGE");
  if (!loc || !fuel) throw new Error("Seed the reference data first (npm run db:seed).");

  const coding = (entityCode: string, category: typeof fuel) => ({
    entityId: ent(entityCode).id,
    locationId: loc.id,
    categoryId: category.id,
    businessPurpose: "Demo expense for testing",
    unitId: null as string | null,
    jobId: null as string | null,
    isIntercompany: false,
  });

  for (const d of DEMO) {
    console.log(`Seeding ${d.name}...`);
    const [u] = await db
      .insert(users)
      .values({ email: `demo.${d.key}@iws.world`, name: d.name, role: "cardholder" })
      .returning();

    const [card] = await db
      .insert(cards)
      .values({ userId: u.id, network: d.network, last4: d.last4, displayName: d.nick, active: true })
      .returning();

    // --- a fully-coded draft (ready) ---
    await db.insert(pendingExpenses).values({
      userId: u.id,
      merchant: "Shell",
      merchantNormalized: "SHELL",
      amountCents: 6218,
      purchaseDate: iso(2),
      cardId: card.id,
      status: "draft",
      createdById: u.id,
      ...coding("IWS", fuel),
    });

    // --- an incomplete draft (missing coding + receipt) ---
    await db.insert(pendingExpenses).values({
      userId: u.id,
      merchant: "Amazon",
      merchantNormalized: "AMAZON",
      amountCents: 14399,
      purchaseDate: iso(1),
      cardId: card.id,
      status: "draft",
      createdById: u.id,
      entityId: null,
      locationId: null,
      categoryId: null,
      businessPurpose: null,
      unitId: null,
      jobId: null,
      isIntercompany: false,
    });

    // --- a submitted report from last week (awaiting reconcile) ---
    const lastWeekStart = iso(9);
    const [report] = await db
      .insert(expenseReports)
      .values({
        userId: u.id,
        periodStart: lastWeekStart,
        periodEnd: iso(3),
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning();
    await db.insert(pendingExpenses).values([
      {
        userId: u.id,
        merchant: "Home Depot",
        merchantNormalized: "HOME DEPOT",
        amountCents: 8734,
        purchaseDate: iso(7),
        cardId: card.id,
        status: "submitted",
        submittedAt: new Date(),
        reportId: report.id,
        createdById: u.id,
        ...coding("PRE", parts),
      },
      {
        userId: u.id,
        merchant: "Whataburger",
        merchantNormalized: "WHATABURGER",
        amountCents: 4210,
        purchaseDate: iso(6),
        cardId: card.id,
        status: "submitted",
        submittedAt: new Date(),
        reportId: report.id,
        createdById: u.id,
        ...coding("IWS", meals),
      },
    ]);
    await db.insert(expenseItems).values({
      userId: u.id,
      kind: "out_of_pocket",
      itemDate: iso(6),
      amountCents: 2695,
      paymentMethod: "personal_card",
      status: "submitted",
      reportId: report.id,
      ...coding("IWS", parts),
    });
    if (rate && mileageCat && d.key === "jordan") {
      await db.insert(expenseItems).values({
        userId: u.id,
        kind: "mileage",
        itemDate: iso(5),
        amountCents: Math.round(48 * Number(rate.ratePerMile) * 100),
        miles: "48.0",
        mileageRateId: rate.id,
        tripFrom: "Main Office",
        tripTo: "Pensacola Warehouse 1",
        status: "submitted",
        reportId: report.id,
        ...coding("IWS", mileageCat),
      });
    }
    await db.insert(approvals).values({
      subjectType: "expense_report",
      subjectId: report.id,
      action: "submit",
      actorId: u.id,
      note: "demo",
    });
  }

  console.log("Done. 4 demo cardholders, cards, drafts, and submitted reports.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
