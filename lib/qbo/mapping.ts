import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { dimensionMappings } from "@/db/schema";

import type { QboDimType } from "./types";

type LocalType = "location" | "unit" | "job" | "category";

const localToQbo: Record<LocalType, QboDimType> = {
  location: "location",
  unit: "class",
  job: "customer",
  category: "account",
};

/** Resolve a local dimension row to its QBO id for a given entity's company file. */
export async function resolveQboId(
  entityId: string,
  localType: LocalType,
  localId: string,
): Promise<string | null> {
  const row = await db.query.dimensionMappings.findFirst({
    where: and(
      eq(dimensionMappings.entityId, entityId),
      eq(dimensionMappings.localType, localType),
      eq(dimensionMappings.localId, localId),
    ),
  });
  return row?.qboId ?? null;
}

export async function upsertMapping(
  entityId: string,
  localType: LocalType,
  localId: string,
  qboId: string,
) {
  await db
    .insert(dimensionMappings)
    .values({ entityId, localType, localId, qboDimType: localToQbo[localType], qboId })
    .onConflictDoUpdate({
      target: [dimensionMappings.entityId, dimensionMappings.localType, dimensionMappings.localId],
      set: { qboId, updatedAt: new Date() },
    });
}

/** Everything an allocation needs mapped before it can be pushed to QBO. */
export interface MappingGap {
  localType: LocalType;
  localId: string;
  label: string;
}

export async function findMappingGaps(
  entityId: string,
  refs: { localType: LocalType; localId: string; label: string }[],
): Promise<MappingGap[]> {
  const gaps: MappingGap[] = [];
  for (const ref of refs) {
    const qboId = await resolveQboId(entityId, ref.localType, ref.localId);
    if (!qboId) gaps.push(ref);
  }
  return gaps;
}
