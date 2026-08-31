import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { pendingExpenses } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

import { CardExpenseForm } from "../card-expense-form";
import { loadCodingOptions, loadUserCards } from "../coding-options";

export default async function EditCardExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const row = await db.query.pendingExpenses.findFirst({ where: eq(pendingExpenses.id, id) });
  if (!row || row.userId !== user.id) notFound();
  if (row.status !== "draft" && row.status !== "rejected") {
    notFound();
  }

  const [options, cards] = await Promise.all([loadCodingOptions(), loadUserCards(user.id)]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">Edit purchase</h1>
      {row.status === "rejected" && row.rejectionReason ? (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Sent back: {row.rejectionReason}
        </p>
      ) : null}
      <CardExpenseForm
        {...options}
        cards={cards}
        initial={{
          id: row.id,
          merchant: row.merchant,
          amountCents: row.amountCents,
          purchaseDate: row.purchaseDate,
          cardId: row.cardId,
          notes: row.notes,
          entityId: row.entityId,
          locationId: row.locationId,
          unitId: row.unitId,
          jobId: row.jobId,
          categoryId: row.categoryId,
          businessPurpose: row.businessPurpose,
        }}
      />
    </div>
  );
}
