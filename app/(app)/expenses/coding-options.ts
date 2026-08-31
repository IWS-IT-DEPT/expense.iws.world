import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cards, categories, entities, jobs, locations, units } from "@/db/schema";

/** Option lists for `<CodingFields>`, shared by every expense form. */
export async function loadCodingOptions() {
  const [entityRows, locationRows, unitRows, jobRows, categoryRows] = await Promise.all([
    db.query.entities.findMany({ where: eq(entities.active, true), orderBy: [asc(entities.code)] }),
    db.query.locations.findMany({
      where: eq(locations.active, true),
      orderBy: [asc(locations.name)],
    }),
    db.query.units.findMany({ where: eq(units.active, true), orderBy: [asc(units.unitNumber)] }),
    db.query.jobs.findMany({ where: eq(jobs.active, true), orderBy: [asc(jobs.jobNumber)] }),
    db.query.categories.findMany({
      where: eq(categories.active, true),
      orderBy: [asc(categories.sortOrder)],
    }),
  ]);
  return {
    entities: entityRows.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      costingMode: e.costingMode,
    })),
    locations: locationRows.map((l) => ({ id: l.id, name: l.name, homeEntityId: l.homeEntityId })),
    units: unitRows.map((u) => ({ id: u.id, entityId: u.entityId, label: u.unitNumber })),
    jobs: jobRows.map((j) => ({
      id: j.id,
      entityId: j.entityId,
      label: `${j.jobNumber}${j.name ? ` — ${j.name}` : ""}`,
    })),
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      requiresJobOrUnit: c.requiresJobOrUnit,
    })),
  };
}

export function cardLabel(c: {
  network: string | null;
  last4: string;
  displayName: string | null;
}): string {
  const net = c.network ? c.network[0].toUpperCase() + c.network.slice(1) : "Card";
  return `${c.displayName ? `${c.displayName} · ` : ""}${net} ····${c.last4}`;
}

export async function loadUserCards(userId: string) {
  const rows = await db.query.cards.findMany({
    where: and(eq(cards.userId, userId), eq(cards.active, true)),
    orderBy: [asc(cards.last4)],
  });
  return rows.map((c) => ({ id: c.id, label: cardLabel(c) }));
}
