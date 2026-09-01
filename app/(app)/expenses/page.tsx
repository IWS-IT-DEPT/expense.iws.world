import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses } from "@/db/schema";
import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";
import { checkExpenseLine, loadPolicy } from "@/lib/expense-checks";

import { EntityBadge } from "../../components/entity-badge";
import { voidCardExpense, voidExpenseItem } from "./actions";
import { cardLabel } from "./coding-options";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reconciled: "Reconciled",
  approved: "Approved",
  rejected: "Sent back",
  cancelled: "Voided",
};
const EDITABLE = new Set(["draft", "rejected"]);

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

  const cards = cardRows
    .filter((r) => r.status !== "cancelled")
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
        categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
      }, policy);
      return { r, checks };
    });

  const items = itemRows.map((r) => {
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
        categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
      },
      policy,
    );
    return { r, checks };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">My Expenses</h1>
        <div className="flex flex-wrap gap-2 text-sm">
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
        </div>
      </div>

      <Section title={`Card purchases (${cards.length})`}>
        {cards.length === 0 ? (
          <Empty>No card purchases logged.</Empty>
        ) : (
          cards.map(({ r, checks }) => (
            <Row
              key={r.id}
              title={r.merchant}
              amount={money(r.amountCents)}
              date={r.purchaseDate}
              status={r.status}
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
              checks={checks.map((c) => c.message)}
              editHref={EDITABLE.has(r.status) ? `/expenses/${r.id}` : undefined}
              upload={
                EDITABLE.has(r.status) ? (
                  <ReceiptUploadButton purpose="pending" targetId={r.id} label="Add receipt" compact />
                ) : null
              }
              voidForm={
                r.status === "draft" || r.status === "rejected" ? (
                  <form action={voidCardExpense}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs underline opacity-50 hover:opacity-100">
                      {r.status === "draft" ? "delete" : "discard"}
                    </button>
                  </form>
                ) : null
              }
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
              title={r.kind === "mileage" ? `Mileage · ${r.miles ?? "?"} mi` : "Out of pocket"}
              amount={money(r.amountCents)}
              date={r.itemDate}
              status={r.status}
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
              checks={checks.map((c) => c.message)}
              upload={
                EDITABLE.has(r.status) && r.kind !== "mileage" ? (
                  <ReceiptUploadButton purpose="item" targetId={r.id} label="Add receipt" compact />
                ) : null
              }
              voidForm={
                r.status === "draft" ? (
                  <form action={voidExpenseItem}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs underline opacity-50 hover:opacity-100">delete</button>
                  </form>
                ) : null
              }
            />
          ))
        )}
      </Section>
    </div>
  );
}

const btn =
  "rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm opacity-60">{children}</p>;
}

function Row(props: {
  title: string;
  amount: string;
  date: string;
  status: string;
  sub: React.ReactNode;
  receipts: number;
  checks: string[];
  editHref?: string;
  upload?: React.ReactNode;
  voidForm?: React.ReactNode;
}) {
  const blocked = props.checks.length > 0;
  return (
    <div className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{props.title}</span>
        <span>{props.amount}</span>
        <span className="opacity-60">{shortDate(props.date)}</span>
        <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
          {STATUS_LABEL[props.status] ?? props.status}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 opacity-80">{props.sub}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="opacity-60">
          {props.receipts > 0 ? `📎 ${props.receipts}` : "no receipt"}
        </span>
        {props.editHref ? (
          <Link href={props.editHref} className="underline opacity-70 hover:opacity-100">
            edit
          </Link>
        ) : null}
        {props.upload}
        {props.voidForm}
      </div>
      {blocked && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
          {props.checks.map((c, i) => (
            <li key={i}>• {c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
