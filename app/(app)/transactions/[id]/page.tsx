import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, entities, jobs, locations, transactions, units } from "@/db/schema";
import { canReview, requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { CodingForm } from "./coding-form";

export default async function CodeTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const txn = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
    with: {
      cardAccount: { with: { owningEntity: true } },
      allocations: true,
      flags: true,
    },
  });
  if (!txn) notFound();
  if (txn.assignedUserId !== user.id && !canReview(user)) notFound();

  const [entityRows, locationRows, unitRows, jobRows, categoryRows] = await Promise.all([
    db.query.entities.findMany({ where: eq(entities.active, true), orderBy: [asc(entities.code)] }),
    db.query.locations.findMany({ where: eq(locations.active, true), orderBy: [asc(locations.name)] }),
    db.query.units.findMany({ where: eq(units.active, true), orderBy: [asc(units.unitNumber)] }),
    db.query.jobs.findMany({ where: eq(jobs.active, true), orderBy: [asc(jobs.jobNumber)] }),
    db.query.categories.findMany({
      where: eq(categories.active, true),
      orderBy: [asc(categories.sortOrder)],
    }),
  ]);

  const existing = txn.allocations[0];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Code this charge</h1>
        <div className="mt-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
          <div className="flex justify-between">
            <span>{shortDate(txn.txnDate)}</span>
            <span className="font-semibold">{money(txn.amountCents)}</span>
          </div>
          <div className="mt-1 font-medium">{txn.merchantRaw}</div>
          <div className="opacity-60">
            {txn.cardAccount.name} · card owner {txn.cardAccount.owningEntity.code}
          </div>
        </div>
      </div>

      {txn.flags.filter((f) => !f.resolved).length > 0 && (
        <ul className="space-y-1 text-sm">
          {txn.flags
            .filter((f) => !f.resolved)
            .map((f) => (
              <li key={f.id} className="text-amber-600 dark:text-amber-400">
                • {f.detail}
              </li>
            ))}
        </ul>
      )}

      <CodingForm
        transactionId={txn.id}
        cardOwnerEntityId={txn.cardAccount.owningEntityId}
        entities={entityRows.map((e) => ({
          id: e.id,
          code: e.code,
          name: e.name,
          costingMode: e.costingMode,
        }))}
        locations={locationRows.map((l) => ({
          id: l.id,
          name: l.name,
          homeEntityId: l.homeEntityId,
        }))}
        units={unitRows.map((u) => ({ id: u.id, entityId: u.entityId, label: u.unitNumber }))}
        jobs={jobRows.map((j) => ({
          id: j.id,
          entityId: j.entityId,
          label: `${j.jobNumber}${j.name ? ` — ${j.name}` : ""}`,
        }))}
        categories={categoryRows.map((c) => ({
          id: c.id,
          name: c.name,
          requiresJobOrUnit: c.requiresJobOrUnit,
        }))}
        initial={
          existing
            ? {
                entityId: existing.entityId,
                locationId: existing.locationId,
                unitId: existing.unitId,
                jobId: existing.jobId,
                categoryId: existing.categoryId,
                businessPurpose: existing.businessPurpose,
              }
            : undefined
        }
      />
    </div>
  );
}
