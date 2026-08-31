import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";
import { cardLabel } from "../expenses/coding-options";
import { ReconcileLine } from "./reconcile-line";

export default async function ReconcilePage() {
  await requireRole("accounting", "approver", "admin");

  const lines = await db.query.pendingExpenses.findMany({
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
  });

  // group: user -> card -> lines
  const byUser = new Map<string, { name: string; lines: typeof lines }>();
  for (const l of lines) {
    const u = byUser.get(l.user.id) ?? { name: l.user.name, lines: [] as typeof lines };
    u.lines.push(l);
    byUser.set(l.user.id, u);
  }

  const userIds = [...byUser.keys()];
  const submittedItems = userIds.length
    ? await db.query.expenseItems.findMany({
        where: and(
          inArray(expenseItems.userId, userIds),
          eq(expenseItems.status, "submitted"),
        ),
        with: { user: { columns: { id: true } }, entity: true, category: true },
      })
    : [];

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Reconcile</h1>
      <p className="max-w-prose text-sm opacity-70">
        Cardholder-submitted charges, grouped by person and card. Cross-check each against the real
        statement and confirm — correcting the posted amount or date if it differs. Out-of-pocket and
        mileage ride along and are approved with the report.
      </p>

      {byUser.size === 0 ? (
        <p className="text-sm opacity-60">Nothing to reconcile right now.</p>
      ) : (
        [...byUser.entries()].map(([uid, u]) => {
          const cards = new Map<string, typeof lines>();
          for (const l of u.lines) {
            const key = l.cardId ?? "none";
            cards.set(key, [...(cards.get(key) ?? []), l]);
          }
          const items = submittedItems.filter((i) => i.user.id === uid);
          return (
            <section key={uid} className="space-y-3">
              <h2 className="font-semibold">{u.name}</h2>
              {[...cards.values()].map((cardLines) => (
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
                        <div className="mt-2 flex flex-wrap gap-2">
                          {l.receipts.map((r) =>
                            r.contentType.startsWith("image/") ? (
                              <a key={r.id} href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/receipts/${r.id}`}
                                  alt="receipt"
                                  className="h-16 w-12 rounded border border-black/10 object-cover dark:border-white/15"
                                />
                              </a>
                            ) : (
                              <a
                                key={r.id}
                                href={`/api/receipts/${r.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex h-16 w-12 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15"
                              >
                                PDF
                              </a>
                            ),
                          )}
                          {l.receipts.length === 0 && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">no receipt</span>
                          )}
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
              {items.length > 0 && (
                <div className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide opacity-60">
                    Out-of-pocket & mileage ({items.length})
                  </p>
                  <ul className="space-y-1">
                    {items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span>
                          {shortDate(i.itemDate)} ·{" "}
                          {i.kind === "mileage" ? `${i.miles ?? "?"} mi` : "out of pocket"} ·{" "}
                          {i.category?.name}
                        </span>
                        <span>{money(i.amountCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
