import { asc } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, cards, entities, users } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { setCardApproval, updateCardAccount, upsertCard } from "../actions";

export default async function AdminCardsPage() {
  const [accounts, cardRows, entityRows, userRows] = await Promise.all([
    db.query.cardAccounts.findMany({ orderBy: [asc(cardAccounts.name)], with: { owningEntity: true } }),
    db.query.cards.findMany({ orderBy: [asc(cards.last4)], with: { cardAccount: true, user: true } }),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
    db.query.users.findMany({ orderBy: [asc(users.name)] }),
  ]);

  const pending = cardRows.filter((c) => c.approvalStatus === "pending");

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
      {pending.length > 0 && (
        <Section title={`Pending approval (${pending.length})`}>
          <div className="space-y-2">
            {pending.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
              >
                <span>
                  <strong>{c.user?.name ?? "someone"}</strong> registered {c.cardAccount.name} ····{" "}
                  {c.last4}
                  {c.displayName ? <span className="opacity-60"> · {c.displayName}</span> : null}
                </span>
                <span className="flex gap-2">
                  <form action={setCardApproval}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
                      Approve
                    </button>
                  </form>
                  <form action={setCardApproval}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs dark:border-white/20">
                      Reject
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

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
        <Table head={["Account", "Last 4", "Label", "Cardholder", "Status", "Active", ""]}>
          {cardRows.map((c) => (
            <Row key={c.id}>
              <td colSpan={7}>
                <form action={upsertCard} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={c.id} />
                  {accountSelect(c.cardAccountId)}
                  <input name="last4" defaultValue={c.last4} maxLength={4} className={`${inputClass} w-20`} />
                  <input name="displayName" defaultValue={c.displayName ?? ""} className={inputClass} />
                  {userSelect(c.userId)}
                  <span
                    className={`text-xs ${
                      c.approvalStatus === "approved"
                        ? "opacity-50"
                        : c.approvalStatus === "pending"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600"
                    }`}
                  >
                    {c.approvalStatus}
                  </span>
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
