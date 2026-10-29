import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cards, users } from "@/db/schema";
import { cardBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";

import { cardLabel } from "../../../expenses/coding-options";
import { DirtyForm } from "../../_dirty-form";
import { inputClass } from "../../_ui";
import { deleteCard, upsertCard } from "../../actions";
import { CARD_NETWORKS } from "../networks";
import { DeleteCardConfirm, SensitiveCardFields } from "./confirm-controls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireRole("admin", "accounting");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();

  const c = await db.query.cards.findFirst({ where: eq(cards.id, id), with: { user: true } });
  if (!c) notFound();

  const [blockers, people] = await Promise.all([
    cardBlockers(id),
    db.query.users.findMany({ orderBy: [asc(users.name)] }),
  ]);
  const resetKey = [c.network, c.last4, c.displayName, c.userId, c.active].join("|");

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <Link href="/admin/cards" className="text-sm underline opacity-70">
          ← Cards
        </Link>
        <h2 className="mt-2 text-lg font-semibold">
          {cardLabel(c)}
          {!c.active ? <span className="ml-2 text-sm font-normal opacity-60">(turned off)</span> : null}
        </h2>
        <p className="text-sm opacity-60">{c.user ? `Held by ${c.user.name}` : "Not assigned to anyone"}</p>
      </div>

      {sp.error ? (
        <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">{sp.error}</p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Details</h3>
        <DirtyForm action={upsertCard} resetKey={resetKey} className="space-y-4 text-sm">
          <input type="hidden" name="id" value={c.id} />
          <label className="block">
            <span className="mb-1 block font-medium">Cardholder</span>
            <select name="userId" defaultValue={c.userId ?? ""} className={`${inputClass} w-full`}>
              <option value="">— unassigned —</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.active ? "" : " (deactivated)"}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs opacity-60">
              Reassigning moves the card to their My Cards list. Expenses already logged keep who logged them.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Network</span>
            <select name="network" defaultValue={c.network ?? ""} className={inputClass}>
              <option value="">—</option>
              {CARD_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Nickname</span>
            <input name="displayName" defaultValue={c.displayName ?? ""} className={`${inputClass} w-full`} />
          </label>
          <SensitiveCardFields originalLast4={c.last4} originalActive={c.active} />
        </DirtyForm>
      </section>

      <section className="space-y-2 border-t border-black/10 pt-6 dark:border-white/15">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Delete card</h3>
        {blockers.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p>This card can&apos;t be deleted because expenses still point at it:</p>
            <ul className="list-disc pl-5">
              {blockers.map((b) => (
                <li key={b.label}>
                  {b.count} {b.label}
                </li>
              ))}
            </ul>
            <p className="opacity-70">
              To stop it being used, untick <strong>Active</strong> above and save — it disappears from the
              card pickers and keeps its history.
            </p>
          </div>
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-red-700 underline dark:text-red-400">Delete this card…</summary>
            <div className="mt-3">
              <DeleteCardConfirm id={c.id} last4={c.last4} label={cardLabel(c)} action={deleteCard} />
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
