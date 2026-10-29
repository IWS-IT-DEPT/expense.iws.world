import { requireUser } from "@/lib/current-user";
import { loadPolicy } from "@/lib/expense-checks";

import { CardExpenseForm } from "../card-expense-form";
import { loadCodingOptions, loadUserCards } from "../coding-options";

export default async function LogPurchasePage() {
  const user = await requireUser();
  const [options, cards, policy] = await Promise.all([
    loadCodingOptions(user.jobExempt),
    loadUserCards(user.id),
    loadPolicy(),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Log a Purchase</h1>
        <p className="text-sm opacity-70">
          Enter a company-card charge you made — snap the receipt first, then which card and what it
          was for. It goes on this week&apos;s report; accounting reconciles it against the statement.
        </p>
      </div>
      <CardExpenseForm {...options} cards={cards} receiptThresholdCents={policy.receiptThresholdCents} />
    </div>
  );
}
