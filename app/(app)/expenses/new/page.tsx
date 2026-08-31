import { requireUser } from "@/lib/current-user";

import { CardExpenseForm } from "../card-expense-form";
import { loadCodingOptions, loadUserCards } from "../coding-options";

export default async function LogPurchasePage() {
  const user = await requireUser();
  const [options, cards] = await Promise.all([loadCodingOptions(), loadUserCards(user.id)]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Log a Purchase</h1>
        <p className="text-sm opacity-70">
          Enter a company-card charge you made — which card, what it was for, and a photo of the
          receipt. It goes on this week&apos;s report; accounting reconciles it against the statement.
        </p>
      </div>
      <CardExpenseForm {...options} cards={cards} />
    </div>
  );
}
