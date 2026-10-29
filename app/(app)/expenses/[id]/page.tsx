import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { checkExpenseLine, loadPolicy, type ExpenseCheck } from "@/lib/expense-checks";
import { money, shortDate } from "@/lib/format";
import { daysOverdue } from "@/lib/overdue";
import { todayInTz } from "@/lib/tz";

import { CardExpenseForm } from "../card-expense-form";
import { loadCodingOptions, loadUserCards, cardLabel } from "../coding-options";
import { DiscardExpense } from "../discard-expense";
import { EDITABLE, STATUS_LABEL, btn } from "../expense-row";
import { ExpenseReceipts } from "../expense-receipts";
import { MileageForm } from "../mileage-form";
import { OutOfPocketForm } from "../out-of-pocket-form";

const PAYMENT_LABEL: Record<string, string> = {
  personal_card: "Personal card",
  cash: "Cash",
  personal_check: "Personal check",
};

/** Who currently has a non-editable expense. */
function whoHasIt(kind: "card" | "item", status: string): string {
  if (status === "approved") return "It's approved and locked — nothing more to do.";
  if (kind === "card") {
    return status === "reconciled"
      ? "It's with an approver for final approval."
      : "It's with Accounting to check against the statement.";
  }
  return "It's with Payroll.";
}

function Header({
  title,
  status,
  overdueDays,
  editable,
  rejectionReason,
  checks,
  submitHint,
  readOnlyNote,
}: {
  title: string;
  status: string;
  overdueDays: number;
  editable: boolean;
  rejectionReason?: string | null;
  checks: ExpenseCheck[];
  submitHint: string;
  readOnlyNote: string;
}) {
  return (
    <div className="space-y-3">
      <Link href="/expenses" className="inline-flex min-h-10 items-center text-sm underline opacity-70">
        ← My Expenses
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded px-2 py-1 font-medium ${
            status === "rejected"
              ? "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300"
              : "bg-black/5 dark:bg-white/10"
          }`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
        {overdueDays > 0 ? (
          <span className="rounded bg-red-600 px-2 py-1 font-medium text-white">
            {overdueDays} {overdueDays === 1 ? "day" : "days"} overdue
          </span>
        ) : null}
      </div>

      {rejectionReason ? (
        <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">
          <strong>Sent back:</strong> {rejectionReason}
        </p>
      ) : null}

      {editable ? (
        checks.length > 0 ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">Still needed before you can submit:</p>
            <ul className="mt-1 space-y-0.5">
              {checks.map((c, n) => (
                <li key={n}>• {c.message}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
            ✓ Everything needed is here. {submitHint}
          </p>
        )
      ) : (
        <p className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">{readOnlyNote}</p>
      )}
    </div>
  );
}

function Summary({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-3 py-2.5">
            <dt className="opacity-60">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const policy = await loadPolicy();
  const today = todayInTz();

  const recSel = { columns: { id: true, contentType: true, filename: true } } as const;

  const card = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, id),
    with: {
      entity: true,
      category: true,
      card: true,
      location: true,
      unit: true,
      job: true,
      receipts: recSel,
    },
  });

  if (card) {
    if (card.userId !== user.id || card.status === "cancelled") notFound();
    const editable = EDITABLE.has(card.status);
    const checks = checkExpenseLine(
      {
        kind: "card",
        amountCents: card.amountCents,
        entityId: card.entityId,
        locationId: card.locationId,
        categoryId: card.categoryId,
        businessPurpose: card.businessPurpose,
        unitId: card.unitId,
        jobId: card.jobId,
        cardId: card.cardId,
        receiptCount: card.receipts.length,
        costingMode: card.entity?.costingMode as CostingMode | undefined,
        jobExempt: user.jobExempt,
        categoryRequiresJobOrUnit: card.category?.requiresJobOrUnit,
      },
      policy,
    );

    const header = (
      <Header
        title={`${card.merchant} · ${money(card.actualAmountCents ?? card.amountCents)}`}
        status={card.status}
        overdueDays={editable ? daysOverdue(card.purchaseDate, today) : 0}
        editable={editable}
        rejectionReason={card.status === "rejected" ? card.rejectionReason : null}
        checks={checks}
        submitHint="Save any edits, then submit it to accounting below."
        readOnlyNote={`This purchase was submitted, so it can't be edited. ${whoHasIt("card", card.status)} If something is wrong, ask them to send it back.`}
      />
    );

    if (!editable) {
      const corrected =
        (card.actualAmountCents !== null && card.actualAmountCents !== card.amountCents) ||
        (card.actualPurchaseDate !== null && card.actualPurchaseDate !== card.purchaseDate);
      return (
        <div className="mx-auto max-w-xl space-y-5">
          {header}
          <Summary
            rows={[
              ["Merchant", card.merchant],
              ["Amount", money(card.amountCents)],
              corrected ? ["Corrected by accounting", `${money(card.actualAmountCents ?? card.amountCents)} · ${shortDate(card.actualPurchaseDate ?? card.purchaseDate)}`] : ["", ""],
              ["Purchase date", shortDate(card.purchaseDate)],
              ["Card", card.card ? cardLabel(card.card) : null],
              ["Company", card.entity ? `${card.entity.code} · ${card.entity.name}` : null],
              ["Location", card.location?.name],
              ["Truck / unit", card.unit?.unitNumber],
              ["Job", card.job?.jobNumber],
              ["Category", card.category?.name],
              ["Purpose", card.businessPurpose],
              ["Notes", card.notes],
            ]}
          />
          <ExpenseReceipts receipts={card.receipts} purpose="pending" targetId={card.id} editable={false} />
        </div>
      );
    }

    const [options, cards] = await Promise.all([loadCodingOptions(user.jobExempt), loadUserCards(user.id)]);
    return (
      <div className="mx-auto max-w-xl space-y-5">
        {header}
        <ExpenseReceipts receipts={card.receipts} purpose="pending" targetId={card.id} />
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Details</h2>
          <CardExpenseForm
            {...options}
            cards={cards}
            submitReady={checks.length === 0}
            initial={{
              id: card.id,
              merchant: card.merchant,
              amountCents: card.amountCents,
              purchaseDate: card.purchaseDate,
              cardId: card.cardId,
              notes: card.notes,
              entityId: card.entityId,
              locationId: card.locationId,
              unitId: card.unitId,
              jobId: card.jobId,
              categoryId: card.categoryId,
              businessPurpose: card.businessPurpose,
            }}
          />
        </section>
        <section className="space-y-2 border-t border-black/10 pt-5 dark:border-white/15">
          <DiscardExpense id={card.id} kind="card" status={card.status as "draft" | "rejected"} />
        </section>
      </div>
    );
  }

  const item = await db.query.expenseItems.findFirst({
    where: eq(expenseItems.id, id),
    with: {
      entity: true,
      category: true,
      location: true,
      unit: true,
      job: true,
      receipts: recSel,
    },
  });
  if (!item || item.userId !== user.id) notFound();

  const editable = EDITABLE.has(item.status);

  // Why it was sent back lives on the audit trail, not the row.
  let reason: string | null = null;
  if (item.status === "rejected") {
    const note = await db.query.approvals.findFirst({
      where: and(
        eq(approvals.subjectType, "expense_item"),
        eq(approvals.subjectId, item.id),
        inArray(approvals.action, ["request_changes", "reject"]),
      ),
      orderBy: [desc(approvals.createdAt)],
      columns: { note: true },
    });
    reason = note?.note ?? null;
  }

  const checks = checkExpenseLine(
    {
      kind: item.kind,
      amountCents: item.amountCents,
      entityId: item.entityId,
      locationId: item.locationId,
      categoryId: item.categoryId,
      businessPurpose: item.businessPurpose,
      unitId: item.unitId,
      jobId: item.jobId,
      receiptCount: item.receipts.length,
      costingMode: item.entity?.costingMode as CostingMode | undefined,
      jobExempt: user.jobExempt,
      categoryRequiresJobOrUnit: item.category?.requiresJobOrUnit,
    },
    policy,
  );

  const title =
    item.kind === "mileage"
      ? `Mileage · ${item.miles ?? "?"} mi · ${money(item.amountCents)}`
      : `Out of pocket · ${money(item.amountCents)}`;

  const header = (
    <Header
      title={title}
      status={item.status}
      overdueDays={editable ? daysOverdue(item.itemDate, today) : 0}
      editable={editable}
      rejectionReason={reason}
      checks={checks}
      submitHint="It goes to Payroll with your weekly report — submit it from This Week."
      readOnlyNote={`This was submitted, so it can't be edited. ${whoHasIt("item", item.status)} If something is wrong, ask them to send it back.`}
    />
  );

  if (!editable) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        {header}
        <Summary
          rows={[
            ["Type", item.kind === "mileage" ? "Mileage" : "Out of pocket"],
            ["Amount", money(item.amountCents)],
            ["Date", shortDate(item.itemDate)],
            ["Miles", item.kind === "mileage" ? item.miles : null],
            ["From", item.tripFrom],
            ["To", item.tripTo],
            ["Paid with", item.paymentMethod ? (PAYMENT_LABEL[item.paymentMethod] ?? item.paymentMethod) : null],
            ["Company", item.entity ? `${item.entity.code} · ${item.entity.name}` : null],
            ["Location", item.location?.name],
            ["Truck / unit", item.unit?.unitNumber],
            ["Job", item.job?.jobNumber],
            ["Category", item.category?.name],
            ["Purpose", item.businessPurpose],
          ]}
        />
        {item.kind !== "mileage" ? (
          <ExpenseReceipts receipts={item.receipts} purpose="item" targetId={item.id} editable={false} />
        ) : null}
      </div>
    );
  }

  const options = await loadCodingOptions(user.jobExempt);
  const codingInit = {
    entityId: item.entityId,
    locationId: item.locationId,
    unitId: item.unitId,
    jobId: item.jobId,
    categoryId: item.categoryId,
    businessPurpose: item.businessPurpose,
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {header}
      {item.kind !== "mileage" ? (
        <ExpenseReceipts receipts={item.receipts} purpose="item" targetId={item.id} />
      ) : null}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Details</h2>
        {item.kind === "mileage" ? (
          <MileageForm
            {...options}
            initial={{ id: item.id, itemDate: item.itemDate, miles: item.miles, tripFrom: item.tripFrom, tripTo: item.tripTo, ...codingInit }}
          />
        ) : (
          <OutOfPocketForm
            {...options}
            initial={{ id: item.id, itemDate: item.itemDate, amountCents: item.amountCents, paymentMethod: item.paymentMethod, ...codingInit }}
          />
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <h2 className="font-semibold">Sending it to Payroll</h2>
        <p className="opacity-70">
          Reimbursements go to Payroll together, as one weekly report — not one at a time. When this one is
          complete, submit your week from the This Week page.
        </p>
        <Link href="/report" className={btn}>
          Go to This Week
        </Link>
      </section>

      <section className="space-y-2 border-t border-black/10 pt-5 dark:border-white/15">
        <DiscardExpense id={item.id} kind="item" status={item.status as "draft" | "rejected"} />
      </section>
    </div>
  );
}
