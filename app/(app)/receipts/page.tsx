import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  cardAccounts,
  categories,
  entities,
  jobs,
  locations,
  pendingExpenses,
  units,
} from "@/db/schema";
import { ConfirmMatchButton } from "@/app/components/confirm-match-button";
import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";
import { requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";
import { findMatchesForPending } from "@/lib/receipt-match";

import { EntityBadge } from "../../components/entity-badge";
import { cancelPendingExpense, deletePendingReceipt } from "./actions";
import { AddToBankButton, EditBankEntryButton } from "./add-button";

type BankRow = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(userId: string) {
  return db.query.pendingExpenses.findMany({
    where: eq(pendingExpenses.userId, userId),
    orderBy: [asc(pendingExpenses.status), desc(pendingExpenses.createdAt)],
    with: {
      receipts: true,
      entity: true,
      location: true,
      category: true,
      matchedTransaction: true,
    },
  });
}

export default async function ReceiptBankPage() {
  const user = await requireUser();

  const [rows, entityRows, locationRows, unitRows, jobRows, categoryRows, cardRows] =
    await Promise.all([
      loadRows(user.id),
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
      db.query.cardAccounts.findMany({
        where: eq(cardAccounts.active, true),
        orderBy: [asc(cardAccounts.name)],
      }),
    ]);

  const codingOptions = {
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
    cardAccounts: cardRows.map((c) => ({ id: c.id, name: c.name })),
  };

  const openRows = rows.filter((r) => r.status === "open");
  const matchedRows = rows.filter((r) => r.status === "matched");

  const suggestions = new Map<string, Awaited<ReturnType<typeof findMatchesForPending>>>();
  await Promise.all(
    openRows.map(async (r) => {
      const m = await findMatchesForPending(r.id);
      if (m.length) suggestions.set(r.id, m.slice(0, 2));
    }),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Receipt Bank</h1>
          <p className="max-w-prose text-sm opacity-70">
            Snap a receipt and code the purchase the moment you buy something. When the charge lands
            on the card statement it&apos;s matched automatically and your coding is applied.
          </p>
        </div>
        <AddToBankButton {...codingOptions} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Waiting for a charge ({openRows.length})
        </h2>
        {openRows.length === 0 ? (
          <p className="text-sm opacity-60">
            Nothing here yet. Use <strong>Add to Receipt Bank</strong> above.
          </p>
        ) : (
          <div className="space-y-3">
            {openRows.map((r) => (
              <div key={r.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <BankRowHeader r={r} />
                <CodingSummary r={r} />
                <Receipts r={r} />
                {suggestions.get(r.id)?.length ? (
                  <div className="mt-3 space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                      Possible match{suggestions.get(r.id)!.length > 1 ? "es" : ""}
                    </p>
                    {suggestions.get(r.id)!.map((c) => (
                      <div key={c.transactionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium">{c.txn.merchantRaw}</span>
                        <span>{money(c.txn.amountCents)}</span>
                        <span className="opacity-60">
                          {shortDate(c.txn.txnDate)} · {c.reasons.join(", ")}
                        </span>
                        {r.coded ? (
                          <ConfirmMatchButton
                            pendingExpenseId={r.id}
                            transactionId={c.transactionId}
                            label="This is the charge"
                          />
                        ) : (
                          <span className="text-xs opacity-60">finish coding to link</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center gap-4">
                  <EditBankEntryButton
                    {...codingOptions}
                    initial={{
                      id: r.id,
                      merchant: r.merchant,
                      amountCents: r.amountCents,
                      purchaseDate: r.purchaseDate,
                      cardAccountId: r.cardAccountId,
                      notes: r.notes,
                      entityId: r.entityId,
                      locationId: r.locationId,
                      unitId: r.unitId,
                      jobId: r.jobId,
                      categoryId: r.categoryId,
                      businessPurpose: r.businessPurpose,
                    }}
                  />
                  <form action={cancelPendingExpense}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs underline opacity-60 hover:opacity-100">Discard</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {matchedRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Matched ({matchedRows.length})
          </h2>
          {matchedRows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 text-sm opacity-80 dark:border-white/15"
            >
              <span>
                {r.merchant} · {money(r.amountCents)} · {shortDate(r.purchaseDate)}
              </span>
              {r.matchedTransaction ? (
                <Link href={`/transactions/${r.matchedTransaction.id}`} className="underline">
                  {r.autoMatched ? "auto-matched" : "matched"} → {r.matchedTransaction.merchantRaw}
                </Link>
              ) : (
                <span className="opacity-60">charge was removed</span>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function BankRowHeader({ r }: { r: BankRow }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <span className="font-medium">{r.merchant}</span>
      <span>{money(r.amountCents)}</span>
      <span className="text-sm opacity-60">{shortDate(r.purchaseDate)}</span>
      {r.notes ? <span className="w-full text-sm opacity-60">{r.notes}</span> : null}
    </div>
  );
}

function CodingSummary({ r }: { r: BankRow }) {
  if (!r.coded || !r.entity) {
    return <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Not coded yet — Edit to add coding.</p>;
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm opacity-80">
      <EntityBadge code={r.entity.code} color={r.entity.brandColor} />
      {r.location?.name}
      {r.category ? ` · ${r.category.name}` : ""}
      {r.businessPurpose ? ` — ${r.businessPurpose}` : ""}
    </p>
  );
}

function Receipts({ r }: { r: BankRow }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {r.receipts.map((rec) => (
        <div key={rec.id} className="group relative">
          {rec.contentType.startsWith("image/") ? (
            <a href={`/api/receipts/${rec.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/receipts/${rec.id}`}
                alt={rec.filename}
                className="h-20 w-16 rounded border border-black/10 object-cover dark:border-white/15"
              />
            </a>
          ) : (
            <a
              href={`/api/receipts/${rec.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-20 w-16 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15"
            >
              PDF
            </a>
          )}
          <form action={deletePendingReceipt} className="absolute -right-1 -top-1">
            <input type="hidden" name="receiptId" value={rec.id} />
            <button
              className="rounded-full bg-black/70 px-1 text-[10px] leading-4 text-white opacity-0 group-hover:opacity-100"
              title="Remove receipt"
            >
              ✕
            </button>
          </form>
        </div>
      ))}
      <ReceiptUploadButton
        purpose="pending"
        targetId={r.id}
        label={r.receipts.length ? "Add another" : "Add receipt"}
        compact={r.receipts.length > 0}
      />
    </div>
  );
}
