import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cards, categories, entities, jobs, locations } from "@/db/schema";

/** Option lists for `<CodingFields>`, shared by every expense form. */
/** `requiresJobCode`: the person must code a job on every expense. */
export async function loadCodingOptions(requiresJobCode = false) {
  const [entityRows, locationRows, jobRows, categoryRows] = await Promise.all([
    db.query.entities.findMany({ where: eq(entities.active, true), orderBy: [asc(entities.code)] }),
    db.query.locations.findMany({
      where: eq(locations.active, true),
      orderBy: [asc(locations.name)],
    }),
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
    })),
    locations: locationRows.map((l) => ({ id: l.id, name: l.name, homeEntityId: l.homeEntityId })),
    jobs: jobRows.map((j) => ({
      id: j.id,
      entityId: j.entityId,
      label: `${j.jobNumber}${j.name ? ` — ${j.name}` : ""}`,
    })),
    categories: categoryRows.map((c) => ({ id: c.id, name: c.name, requiresJob: c.requiresJob })),
    userRequiresJob: requiresJobCode,
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
