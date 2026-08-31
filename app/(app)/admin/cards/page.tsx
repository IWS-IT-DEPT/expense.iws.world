import { asc } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, cards, entities, users } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { updateCardAccount, upsertCard } from "../actions";

const NETWORKS = ["visa", "mastercard", "amex", "discover", "other"];

export default async function AdminCardsPage() {
  const [accounts, cardRows, entityRows, userRows] = await Promise.all([
    db.query.cardAccounts.findMany({ orderBy: [asc(cardAccounts.name)], with: { owningEntity: true } }),
    db.query.cards.findMany({ orderBy: [asc(cards.last4)], with: { cardAccount: true, user: true } }),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
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
  const accountSelect = (selected?: string | null) => (
    <select name="cardAccountId" defaultValue={selected ?? ""} className={inputClass}>
      <option value="">— no account —</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
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
      <Section title="Card accounts">
        <p className="text-xs opacity-60">
          The real card programs (statement source, QBO owning entity). Cardholders register their
          own cards on <span className="font-mono">My Cards</span>; link one here only if you want it
          tied to an account.
        </p>
        <Table head={["Name", "Owner", "Active", ""]}>
          {accounts.map((a) => (
            <Row key={a.id}>
              <td colSpan={4}>
                <form action={updateCardAccount} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={a.id} />
                  <input name="name" defaultValue={a.name} className={`${inputClass} w-72`} />
                  <select name="owningEntityId" defaultValue={a.owningEntityId} className={inputClass}>
                    {entityRows.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.code}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={a.active} /> active
                  </label>
                  <SaveButton />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>

      <Section title="Add card">
        <form action={upsertCard} className="flex flex-wrap items-end gap-2">
          {networkSelect()}
          <input name="last4" required maxLength={4} placeholder="1234" className={`${inputClass} w-20`} />
          <input name="displayName" placeholder="label" className={inputClass} />
          {userSelect()}
          {accountSelect()}
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
      </Section>

      <Section title={`Cards (${cardRows.length})`}>
        <Table head={["Network", "Last 4", "Label", "Cardholder", "Account", "Active", ""]}>
          {cardRows.map((c) => (
            <Row key={c.id}>
              <td colSpan={7}>
                <form action={upsertCard} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={c.id} />
                  {networkSelect(c.network)}
                  <input name="last4" defaultValue={c.last4} maxLength={4} className={`${inputClass} w-20`} />
                  <input name="displayName" defaultValue={c.displayName ?? ""} className={inputClass} />
                  {userSelect(c.userId)}
                  {accountSelect(c.cardAccountId)}
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
