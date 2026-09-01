import { asc } from "drizzle-orm";

import { db } from "@/db";
import { cards, users } from "@/db/schema";
import { usedCardIds } from "@/lib/admin-usage";

import { DeleteCell, inputClass, SaveButton, Section } from "../_ui";
import { deleteCard, upsertCard } from "../actions";

const NETWORKS = ["visa", "mastercard", "amex", "discover", "other"];

const GRID = "grid grid-cols-[8rem_4.5rem_minmax(8rem,1fr)_11rem_5rem_auto] items-center gap-2";

export default async function AdminCardsPage() {
  const [cardRows, userRows, used] = await Promise.all([
    db.query.cards.findMany({ orderBy: [asc(cards.last4)], with: { user: true } }),
    db.query.users.findMany({ orderBy: [asc(users.name)] }),
    usedCardIds(),
  ]);

  const userOptions = (
    <>
      <option value="">— unassigned —</option>
      {userRows.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </>
  );

  return (
    <div className="space-y-8">
      <p className="text-sm opacity-60">
        Cardholders register their own cards on <span className="font-mono">My Cards</span>. This is
        for adding one on their behalf, fixing a typo, reassigning, or deactivating a lost card.
        Delete is available only while no expense references the card.
      </p>

      <Section title="Add card">
        <form action={upsertCard} className="flex flex-wrap items-end gap-2">
          <select name="network" defaultValue="" className={inputClass}>
            <option value="">network…</option>
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input name="last4" required maxLength={4} placeholder="1234" className={`${inputClass} w-20`} />
          <input name="displayName" placeholder="nickname" className={inputClass} />
          <select name="userId" defaultValue="" className={inputClass}>
            {userOptions}
          </select>
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
      </Section>

      <Section title={`Cards (${cardRows.length})`}>
        <div className="overflow-x-auto">
          <div className="min-w-[46rem] space-y-1">
            <div className={`${GRID} px-1 text-xs font-medium uppercase tracking-wide opacity-50`}>
              <span>Network</span>
              <span>Last 4</span>
              <span>Nickname</span>
              <span>Cardholder</span>
              <span>Active</span>
              <span />
            </div>

            {cardRows.map((c) => (
              <form
                key={c.id}
                action={upsertCard}
                className={`${GRID} border-t border-black/10 py-1.5 dark:border-white/10`}
              >
                <input type="hidden" name="id" value={c.id} />
                <select name="network" defaultValue={c.network ?? ""} className={inputClass}>
                  <option value="">—</option>
                  {NETWORKS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <input name="last4" defaultValue={c.last4} maxLength={4} className={inputClass} />
                <input name="displayName" defaultValue={c.displayName ?? ""} className={inputClass} />
                <select name="userId" defaultValue={c.userId ?? ""} className={inputClass}>
                  {userOptions}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="active" defaultChecked={c.active} /> active
                </label>
                <div className="flex items-center gap-2">
                  <SaveButton />
                  <DeleteCell used={used.has(c.id)} action={deleteCard} />
                </div>
              </form>
            ))}

            {cardRows.length === 0 && (
              <p className="px-1 py-2 text-sm opacity-60">No cards registered yet.</p>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
