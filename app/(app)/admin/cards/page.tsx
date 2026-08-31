import { asc } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, cards, entities, users } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { updateCardAccount, upsertCard } from "../actions";

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
  const accountSelect = (selected?: string) => (
    <select name="cardAccountId" required defaultValue={selected ?? ""} className={inputClass}>
      <option value="">account…</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      <Section title="Card accounts">
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
          {accountSelect()}
          <input name="last4" required maxLength={4} placeholder="1234" className={`${inputClass} w-20`} />
          <input name="displayName" placeholder="label" className={inputClass} />
          {userSelect()}
          <input type="hidden" name="active" value="on" />
          <SaveButton label="Add" />
        </form>
        <p className="text-xs opacity-60">
          Statement imports auto-assign transactions to the cardholder matched here by last 4.
        </p>
      </Section>

      <Section title={`Cards (${cardRows.length})`}>
        <Table head={["Account", "Last 4", "Label", "Cardholder", "Active", ""]}>
          {cardRows.map((c) => (
            <Row key={c.id}>
              <td colSpan={6}>
                <form action={upsertCard} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={c.id} />
                  {accountSelect(c.cardAccountId)}
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
