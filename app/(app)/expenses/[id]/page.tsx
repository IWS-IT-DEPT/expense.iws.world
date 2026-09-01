import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { checkExpenseLine, loadPolicy, type ExpenseCheck } from "@/lib/expense-checks";
import { money } from "@/lib/format";

import { submitCardExpense } from "../actions";
import { CardExpenseForm } from "../card-expense-form";
import { loadCodingOptions, loadUserCards } from "../coding-options";
import { ExpenseReceipts } from "../expense-receipts";
import { MileageForm } from "../mileage-form";
import { OutOfPocketForm } from "../out-of-pocket-form";

const EDITABLE = new Set(["draft", "rejected"]);

function Header({
  title,
  rejectionReason,
  checks,
}: {
  title: string;
  rejectionReason?: string | null;
  checks: ExpenseCheck[];
}) {
  return (
    <>
      <h1 className="text-lg font-semibold">{title}</h1>
      {rejectionReason ? (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Sent back: {rejectionReason}
        </p>
      ) : null}
      {checks.length > 0 ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">Still needed before you can submit:</p>
          <ul className="mt-1 space-y-0.5">
            {checks.map((c, n) => (
              <li key={n}>• {c.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Complete and ready for the weekly report.
        </p>
      )}
    </>
  );
}

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const policy = await loadPolicy();

  const card = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.id, id),
    with: { entity: true, category: true, receipts: { columns: { id: true, contentType: true, filename: true } } },
  });

  if (card) {
    if (card.userId !== user.id) notFound();
    // already submitted / reconciled / approved / voided — nothing to edit here
    if (!EDITABLE.has(card.status)) redirect("/expenses");
    const [options, cards] = await Promise.all([loadCodingOptions(), loadUserCards(user.id)]);
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
        categoryRequiresJobOrUnit: card.category?.requiresJobOrUnit,
      },
      policy,
    );
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Header
          title={`${card.merchant} · ${money(card.amountCents)}`}
          rejectionReason={card.status === "rejected" ? card.rejectionReason : null}
          checks={checks}
        />
        {checks.length === 0 ? (
          <form action={submitCardExpense}>
            <input type="hidden" name="id" value={card.id} />
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
              Submit to accounting
            </button>
          </form>
        ) : null}
        <ExpenseReceipts receipts={card.receipts} purpose="pending" targetId={card.id} />
        <CardExpenseForm
          {...options}
          cards={cards}
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
      </div>
    );
  }

  const item = await db.query.expenseItems.findFirst({
    where: eq(expenseItems.id, id),
    with: { entity: true, category: true, receipts: { columns: { id: true, contentType: true, filename: true } } },
  });
  if (!item || item.userId !== user.id) notFound();
  if (!EDITABLE.has(item.status)) redirect("/expenses");

  const options = await loadCodingOptions();
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
      categoryRequiresJobOrUnit: item.category?.requiresJobOrUnit,
    },
    policy,
  );
  const codingInit = {
    entityId: item.entityId,
    locationId: item.locationId,
    unitId: item.unitId,
    jobId: item.jobId,
    categoryId: item.categoryId,
    businessPurpose: item.businessPurpose,
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Header
        title={item.kind === "mileage" ? `Mileage · ${item.miles ?? "?"} mi` : `Out of pocket · ${money(item.amountCents)}`}
        rejectionReason={item.status === "rejected" ? null : null}
        checks={checks}
      />
      <ExpenseReceipts receipts={item.receipts} purpose="item" targetId={item.id} />
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
    </div>
  );
}
