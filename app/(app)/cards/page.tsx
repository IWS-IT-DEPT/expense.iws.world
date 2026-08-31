import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cards } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

import { cardLabel } from "../expenses/coding-options";
import { removeMyCard } from "./actions";
import { RegisterCardForm } from "./register-card-form";

export default async function MyCardsPage() {
  const user = await requireUser();
  const mine = await db.query.cards.findMany({
    where: eq(cards.userId, user.id),
    orderBy: [asc(cards.last4)],
  });
  const active = mine.filter((c) => c.active);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">My Cards</h1>
        <p className="text-sm opacity-70">
          Register each company card you carry. When you log a purchase you pick which card it was
          on, and accounting reconciles it against that card&apos;s statement.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Add a card</h2>
        <RegisterCardForm />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Your cards ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm opacity-60">None registered yet.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
              >
                <span>{cardLabel(c)}</span>
                <form action={removeMyCard}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs underline opacity-60 hover:opacity-100">remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
