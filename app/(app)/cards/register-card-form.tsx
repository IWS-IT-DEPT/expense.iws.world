"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { registerCard, type RegisterCardState } from "./actions";

const inputClass =
  "rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20";

export function RegisterCardForm({
  cardAccounts,
}: {
  cardAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<RegisterCardState, FormData>(
    async (prev, fd) => {
      const r = await registerCard(prev, fd);
      if (r.ok) router.refresh();
      return r;
    },
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <select name="cardAccountId" required defaultValue="" className={inputClass}>
        <option value="" disabled>
          Card program…
        </option>
        {cardAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="text-sm">
        <span className="mb-1 block text-xs opacity-60">Last 4 digits</span>
        <input
          name="last4"
          required
          inputMode="numeric"
          maxLength={4}
          placeholder="1234"
          className={`${inputClass} w-20`}
        />
      </label>
      <input name="displayName" placeholder="label (optional)" className={inputClass} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Sending…" : "Register card"}
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? (
        <p className="w-full text-sm text-emerald-600">Sent to IT for approval.</p>
      ) : null}
    </form>
  );
}
