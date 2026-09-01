import { asc } from "drizzle-orm";

import { db } from "@/db";
import { cards, users } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { upsertCard } from "../actions";

const NETWORKS = ["visa", "mastercard", "amex", "discover", "other"];

export default async function AdminCardsPage() {
  const [cardRows, userRows] = await Promise.all([
    db.query.cards.findMany({ orderBy: [asc(cards.last4)], with: { user: true } }),
    db.query.users.findMany({ orderBy: [asc(users.name)] }),
  ]);

  const userSelect = (selected?: string | null) => (
    <select name="userId" defaultValue={selected ?? ""} className={inputClass}>
      <option value="">— unassigned —</option>
      {userRows.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
  const networkSelect = (selected?: string | null) => (
    <select name="network" defaultValue={selected ?? ""} className={inputClass}>
      <option value="">network…</option>
      {NETWORKS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <p className="text-sm opacity-60">
        Cardholders register their own cards on <span className="font-mono">My Cards</span>. This is
        for viewing them, fixing a typo, reassigning, or deactivating a lost card.
      </p>

      <Section title={`Cards (${cardRows.length})`}>
        <Table head={["Network", "Last 4", "Nickname", "Cardholder", "Active", ""]}>
          {cardRows.map((c) => (
            <Row key={c.id}>
              <td colSpan={6}>
                <form action={upsertCard} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={c.id} />
                  {networkSelect(c.network)}
                  <input name="last4" defaultValue={c.last4} maxLength={4} className={`${inputClass} w-20`} />
                  <input name="displayName" defaultValue={c.displayName ?? ""} className={inputClass} />
                  {userSelect(c.userId)}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={c.active} /> active
                  </label>
                  <SaveButton />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
