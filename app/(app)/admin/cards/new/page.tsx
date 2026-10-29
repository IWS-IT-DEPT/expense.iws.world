import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { SubmitButton } from "@/app/components/submit-button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { inputClass } from "../../_ui";
import { upsertCard } from "../../actions";
import { CARD_NETWORKS } from "../networks";

export default async function NewCardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole("admin", "accounting");
  const sp = await searchParams;
  const people = await db.query.users.findMany({ where: eq(users.active, true), orderBy: [asc(users.name)] });

  return (
    <div className="max-w-xl space-y-4">
      <Link href="/admin/cards" className="text-sm underline opacity-70">
        ← Cards
      </Link>
      <h2 className="text-base font-semibold">Add card</h2>
      {sp.error ? (
        <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">{sp.error}</p>
      ) : null}
      <form action={upsertCard} className="space-y-4 text-sm">
        <input type="hidden" name="active" value="on" />
        <label className="block">
          <span className="mb-1 block font-medium">Cardholder</span>
          <select name="userId" defaultValue="" className={`${inputClass} w-full`}>
            <option value="">— unassigned —</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Network</span>
          <select name="network" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {CARD_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Last 4 digits</span>
          <input
            name="last4"
            required
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{4}"
            title="Exactly 4 digits"
            placeholder="1234"
            className={`${inputClass} w-24 font-mono`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Nickname</span>
          <input name="displayName" placeholder="optional, e.g. Fuel card" className={`${inputClass} w-full`} />
        </label>
        <SubmitButton
          type="submit"
          className="rounded-md bg-black px-3.5 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add card
        </SubmitButton>
      </form>
    </div>
  );
}
