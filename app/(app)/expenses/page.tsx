import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { money } from "@/lib/format";
import { daysOverdue } from "@/lib/overdue";
import { todayInTz } from "@/lib/tz";
import { checkExpenseLine, loadPolicy } from "@/lib/expense-checks";

import { EntityBadge } from "../../components/entity-badge";
import { cardLabel } from "./coding-options";
import { btn, EDITABLE, Empty, Row, Section } from "./expense-row";


export default async function ExpensesPage() {
  const user = await requireUser();
  const policy = await loadPolicy();

  const [cardRows, itemRows] = await Promise.all([
    db.query.pendingExpenses.findMany({
      where: eq(pendingExpenses.userId, user.id),
      orderBy: [desc(pendingExpenses.purchaseDate), desc(pendingExpenses.createdAt)],
      with: {
        card: true,
        entity: true,
        category: true,
        receipts: { columns: { id: true } },
      },
    }),
    db.query.expenseItems.findMany({
      where: eq(expenseItems.userId, user.id),
      orderBy: [desc(expenseItems.itemDate), desc(expenseItems.createdAt)],
      with: { entity: true, category: true, receipts: { columns: { id: true } } },
    }),
  ]);

  // Why an item was sent back lives on the `approvals` audit trail, not the row.
  const rejectedItemIds = itemRows.filter((r) => r.status === "rejected").map((r) => r.id);
  const itemReason = new Map<string, string>();
  if (rejectedItemIds.length) {
    const notes = await db.query.approvals.findMany({
      where: and(
        eq(approvals.subjectType, "expense_item"),
        inArray(approvals.subjectId, rejectedItemIds),
        inArray(approvals.action, ["request_changes", "reject"]),
      ),
      orderBy: [desc(approvals.createdAt)],
      columns: { subjectId: true, note: true },
    });
    for (const n of notes) {
      if (n.note && !itemReason.has(n.subjectId)) itemReason.set(n.subjectId, n.note);
    }
  }

  const today = todayInTz();
  // Approved expenses are done — they live on the History tab.
  const cards = cardRows
    .filter((r) => r.status !== "cancelled" && r.status !== "approved")
    .map((r) => {
      const checks = checkExpenseLine({
        kind: "card",
        amountCents: r.amountCents,
        entityId: r.entityId,
        locationId: r.locationId,
        categoryId: r.categoryId,
        businessPurpose: r.businessPurpose,
        unitId: r.unitId,
        jobId: r.jobId,
        cardId: r.cardId,
        receiptCount: r.receipts.length,
        costingMode: r.entity?.costingMode as CostingMode | undefined,
        jobExempt: user.jobExempt,
        categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
      }, policy);
      return { r, checks };
    });

  const items = itemRows
    .filter((r) => r.status !== "approved")
    .map((r) => {
    const checks = checkExpenseLine(
      {
        kind: r.kind,
        amountCents: r.amountCents,
        entityId: r.entityId,
        locationId: r.locationId,
        categoryId: r.categoryId,
        businessPurpose: r.businessPurpose,
        unitId: r.unitId,
        jobId: r.jobId,
        receiptCount: r.receipts.length,
        costingMode: r.entity?.costingMode as CostingMode | undefined,
        jobExempt: user.jobExempt,
        categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
      },
      policy,
    );
    return { r, checks };
  });

  // Only unsubmitted work can be overdue.
  const overdue = (status: string, date: string) =>
    EDITABLE.has(status) ? daysOverdue(date, today) : 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">My Expenses</h1>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Link href="/expenses/new" className={btn}>
            + Log a Purchase
          </Link>
          <Link href="/expenses/out-of-pocket" className={btn}>
            + Out of Pocket
          </Link>
          {user.mileageEligible && (
            <Link href="/expenses/mileage" className={btn}>
              + Mileage
            </Link>
          )}
          {user.mileageEligible && (
            <Link href="/expenses/trip" className={btn}>
              Start trip
            </Link>
          )}
          <Link href="/expenses/history" className={btn}>
            History
          </Link>
        </div>
        <p className="text-xs opacity-60">Tap any expense to open it — edit, add a receipt, submit or discard from there.</p>
      </div>

      <Section title={`Card purchases (${cards.length})`}>
        {cards.length === 0 ? (
          <Empty>No card purchases logged.</Empty>
        ) : (
          cards.map(({ r, checks }) => (
            <Row
              key={r.id}
              href={`/expenses/${r.id}`}
              title={r.merchant}
              amount={money(r.amountCents)}
              date={r.purchaseDate}
              overdueDays={overdue(r.status, r.purchaseDate)}
              status={r.status}
              rejected={r.status === "rejected"}
              reason={r.rejectionReason ?? undefined}
              sub={
                <>
                  {r.card ? cardLabel(r.card) : <span className="text-red-600">no card</span>}
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
              needs={EDITABLE.has(r.status) ? checks.map((c) => c.message) : []}
            />
          ))
        )}
      </Section>

      <Section title={`Out-of-pocket & mileage (${items.length})`}>
        {items.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          items.map(({ r, checks }) => (
            <Row
              key={r.id}
              href={`/expenses/${r.id}`}
              title={r.kind === "mileage" ? `Mileage · ${r.miles ?? "?"} mi` : "Out of pocket"}
              amount={money(r.amountCents)}
              date={r.itemDate}
              overdueDays={overdue(r.status, r.itemDate)}
              status={r.status}
              rejected={r.status === "rejected"}
              reason={itemReason.get(r.id)}
              sub={
                <>
                  {r.entity ? <EntityBadge code={r.entity.code} color={r.entity.brandColor} /> : null}
                  {r.category ? ` · ${r.category.name}` : ""}
                  {r.kind === "mileage" && (r.tripFrom || r.tripTo)
                    ? ` · ${r.tripFrom ?? "?"} → ${r.tripTo ?? "?"}`
                    : ""}
                </>
              }
              receipts={r.receipts.length}
              needs={EDITABLE.has(r.status) ? checks.map((c) => c.message) : []}
            />
          ))
        )}
      </Section>
    </div>
  );
}
