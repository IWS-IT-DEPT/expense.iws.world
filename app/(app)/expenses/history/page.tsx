import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { money } from "@/lib/format";

import { EntityBadge } from "../../../components/entity-badge";
import { cardLabel } from "../coding-options";
import { btn, Empty, Row } from "../expense-row";

const PAGE_SIZE = 20;

/** Approved expenses (card + reimbursement), newest first, paginated. */
export default async function ExpenseHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const { page: pageParam } = await searchParams;

  // Light index of everything approved, merged and sorted; details load for one page only.
  const [cardIdx, itemIdx] = await Promise.all([
    db
      .select({ id: pendingExpenses.id, date: pendingExpenses.purchaseDate, at: pendingExpenses.createdAt })
      .from(pendingExpenses)
      .where(and(eq(pendingExpenses.userId, user.id), eq(pendingExpenses.status, "approved"))),
    db
      .select({ id: expenseItems.id, date: expenseItems.itemDate, at: expenseItems.createdAt })
      .from(expenseItems)
      .where(and(eq(expenseItems.userId, user.id), eq(expenseItems.status, "approved"))),
  ]);

  const index = [
    ...cardIdx.map((r) => ({ ...r, kind: "card" as const })),
    ...itemIdx.map((r) => ({ ...r, kind: "item" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.getTime() - a.at.getTime());

  const pages = Math.max(1, Math.ceil(index.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1));
  const slice = index.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cardIds = slice.filter((r) => r.kind === "card").map((r) => r.id);
  const itemIds = slice.filter((r) => r.kind === "item").map((r) => r.id);
  const [cards, items] = await Promise.all([
    cardIds.length
      ? db.query.pendingExpenses.findMany({
          where: inArray(pendingExpenses.id, cardIds),
          with: { card: true, entity: true, category: true, receipts: { columns: { id: true } } },
        })
      : [],
    itemIds.length
      ? db.query.expenseItems.findMany({
          where: inArray(expenseItems.id, itemIds),
          with: { entity: true, category: true, receipts: { columns: { id: true } } },
        })
      : [],
  ]);
  const cardById = new Map(cards.map((r) => [r.id, r]));
  const itemById = new Map(items.map((r) => [r.id, r]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">History</h1>
          <p className="text-sm opacity-70">
            Approved expenses ({index.length}). These are locked and no longer need anything from you.
          </p>
        </div>
        <Link href="/expenses" className={`${btn} text-sm`}>
          ← My Expenses
        </Link>
      </div>

      {slice.length === 0 ? (
        <Empty>Nothing approved yet.</Empty>
      ) : (
        <div className="space-y-2">
          {slice.map((ix) => {
            if (ix.kind === "card") {
              const r = cardById.get(ix.id);
              if (!r) return null;
              return (
                <Row
                  key={r.id}
                  title={r.merchant}
                  amount={money(r.actualAmountCents ?? r.amountCents)}
                  date={r.actualPurchaseDate ?? r.purchaseDate}
                  status={r.status}
                  sub={
                    <>
                      {r.card ? cardLabel(r.card) : null}
                      {r.entity ? (
                        <>
                          {" · "}
                          <EntityBadge code={r.entity.code} color={r.entity.brandColor} />
                        </>
                      ) : null}
                      {r.category ? ` · ${r.category.name}` : ""}
                    </>
                  }
                  receipts={r.receipts.length}
                  checks={[]}
                />
              );
            }
            const r = itemById.get(ix.id);
            if (!r) return null;
            return (
              <Row
                key={r.id}
                title={r.kind === "mileage" ? `Mileage · ${r.miles ?? "?"} mi` : "Out of pocket"}
                amount={money(r.amountCents)}
                date={r.itemDate}
                status={r.status}
                sub={
                  <>
                    {r.entity ? <EntityBadge code={r.entity.code} color={r.entity.brandColor} /> : null}
                    {r.category ? ` · ${r.category.name}` : ""}
                  </>
                }
                receipts={r.receipts.length}
                checks={[]}
              />
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={`/expenses/history?page=${page - 1}`} className={btn}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="opacity-70">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/expenses/history?page=${page + 1}`} className={btn}>
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
