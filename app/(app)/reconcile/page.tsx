import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";
import { cardLabel } from "../expenses/coding-options";
import { ReconcileLine } from "./reconcile-line";

type Rec = { id: string; contentType: string };

function ReceiptStrip({ receipts }: { receipts: Rec[] }) {
  if (receipts.length === 0) {
    return <span className="text-xs text-amber-600 dark:text-amber-400">no receipt</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {receipts.map((r) => (
        <a key={r.id} href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">
          {r.contentType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/receipts/${r.id}`}
              alt="receipt"
              className="h-16 w-12 rounded border border-black/10 object-cover dark:border-white/15"
            />
          ) : (
            <span className="flex h-16 w-12 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15">
              PDF
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

export default async function ReconcilePage() {
  await requireRole("accounting", "approver", "admin");

  const [lines, items] = await Promise.all([
    db.query.pendingExpenses.findMany({
      where: eq(pendingExpenses.status, "submitted"),
      orderBy: [asc(pendingExpenses.purchaseDate)],
      with: {
        user: { columns: { id: true, name: true } },
        card: true,
        entity: true,
        location: true,
        category: true,
        receipts: { columns: { id: true, contentType: true } },
      },
    }),
    db.query.expenseItems.findMany({
      where: eq(expenseItems.status, "submitted"),
      orderBy: [asc(expenseItems.itemDate)],
      with: {
        user: { columns: { id: true, name: true } },
        entity: true,
        location: true,
        category: true,
        receipts: { columns: { id: true, contentType: true } },
      },
    }),
  ]);

  // union of users who have something submitted
  const users = new Map<string, string>();
  for (const l of lines) users.set(l.user.id, l.user.name);
  for (const i of items) users.set(i.user.id, i.user.name);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Reconcile</h1>
      <p className="max-w-prose text-sm opacity-70">
        Cardholder-submitted expenses, grouped by person. Cross-check each card charge against the
        statement and confirm — correcting the posted amount or date if it differs. Out-of-pocket and
        mileage don&apos;t need reconciling; they&apos;re approved with the report.
      </p>

      {users.size === 0 ? (
        <p className="text-sm opacity-60">Nothing to reconcile right now.</p>
      ) : (
        [...users.entries()].map(([uid, name]) => {
          const userCards = new Map<string, typeof lines>();
          for (const l of lines.filter((x) => x.user.id === uid)) {
            const key = l.cardId ?? "none";
            userCards.set(key, [...(userCards.get(key) ?? []), l]);
          }
          const userItems = items.filter((i) => i.user.id === uid);

          return (
            <section key={uid} className="space-y-3">
              <h2 className="font-semibold">{name}</h2>

              {[...userCards.values()].map((cardLines) => (
                <div
                  key={cardLines[0].cardId ?? "none"}
                  className="rounded-lg border border-black/10 dark:border-white/15"
                >
                  <div className="border-b border-black/10 px-4 py-2 text-sm font-medium dark:border-white/15">
                    {cardLines[0].card ? cardLabel(cardLines[0].card) : "No card selected"}
                  </div>
                  <div className="divide-y divide-black/5 dark:divide-white/10">
                    {cardLines.map((l) => (
                      <div key={l.id} className="p-4 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{l.merchant}</span>
                          <span>{money(l.amountCents)}</span>
                          <span className="opacity-60">{shortDate(l.purchaseDate)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 opacity-80">
                          {l.entity ? (
                            <EntityBadge code={l.entity.code} color={l.entity.brandColor} />
                          ) : null}
                          {l.location?.name}
                          {l.category ? ` · ${l.category.name}` : ""}
                          {l.businessPurpose ? ` — ${l.businessPurpose}` : ""}
                        </div>
                        <div className="mt-2">
                          <ReceiptStrip receipts={l.receipts} />
                        </div>
                        <ReconcileLine
                          lineId={l.id}
                          amountLabel={(l.amountCents / 100).toFixed(2)}
                          dateLabel={l.purchaseDate}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {userItems.length > 0 && (
                <div className="rounded-lg border border-black/10 dark:border-white/15">
                  <div className="border-b border-black/10 px-4 py-2 text-xs font-medium uppercase tracking-wide opacity-60 dark:border-white/15">
                    Out-of-pocket &amp; mileage ({userItems.length}) — reviewed at approval
                  </div>
                  <div className="divide-y divide-black/5 dark:divide-white/10">
                    {userItems.map((i) => (
                      <div key={i.id} className="p-4 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">
                            {i.kind === "mileage"
                              ? `Mileage · ${i.miles ?? "?"} mi`
                              : "Out of pocket"}
                          </span>
                          <span>{money(i.amountCents)}</span>
                          <span className="opacity-60">{shortDate(i.itemDate)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 opacity-80">
                          {i.entity ? (
                            <EntityBadge code={i.entity.code} color={i.entity.brandColor} />
                          ) : null}
                          {i.location?.name}
                          {i.category ? ` · ${i.category.name}` : ""}
                          {i.kind === "mileage" && (i.tripFrom || i.tripTo)
                            ? ` · ${i.tripFrom ?? "?"} → ${i.tripTo ?? "?"}`
                            : ""}
                          {i.businessPurpose ? ` — ${i.businessPurpose}` : ""}
                        </div>
                        {i.kind !== "mileage" && (
                          <div className="mt-2">
                            <ReceiptStrip receipts={i.receipts} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
