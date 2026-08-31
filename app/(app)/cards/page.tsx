import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, cards } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

import { removeMyCard } from "./actions";
import { RegisterCardForm } from "./register-card-form";

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "text-emerald-700 dark:text-emerald-400" },
  pending: { label: "Pending IT approval", cls: "text-amber-600 dark:text-amber-400" },
  rejected: { label: "Rejected", cls: "text-red-600" },
};

export default async function MyCardsPage() {
  const user = await requireUser();

  const [mine, accounts] = await Promise.all([
    db.query.cards.findMany({
      where: eq(cards.userId, user.id),
      with: { cardAccount: true },
      orderBy: [asc(cards.last4)],
    }),
    db.query.cardAccounts.findMany({
      where: eq(cardAccounts.active, true),
      orderBy: [asc(cardAccounts.name)],
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">My Cards</h1>
        <p className="text-sm opacity-70">
          Register each company card you carry so imported charges are assigned to you
          automatically. IT approves new registrations before they take effect.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Register a card</h2>
        <RegisterCardForm cardAccounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Your cards ({mine.length})
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm opacity-60">None registered yet.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((c) => {
              const s = STATUS[c.approvalStatus] ?? STATUS.pending;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
                >
                  <span>
                    {c.cardAccount.name} ···· {c.last4}
                    {c.displayName ? <span className="opacity-60"> · {c.displayName}</span> : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={s.cls}>{s.label}</span>
                    {c.approvalStatus !== "approved" ? (
                      <form action={removeMyCard}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs underline opacity-60 hover:opacity-100">
                          remove
                        </button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
