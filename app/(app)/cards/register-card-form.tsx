"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { registerCard, type RegisterCardState } from "./actions";

const inputClass =
  "rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20";

const NETWORKS = [
  ["visa", "Visa"],
  ["mastercard", "Mastercard"],
  ["amex", "Amex"],
  ["discover", "Discover"],
  ["other", "Other"],
] as const;

export function RegisterCardForm() {
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
      <label className="text-sm">
        <span className="mb-1 block text-xs opacity-60">Network</span>
        <select name="network" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select…
          </option>
          {NETWORKS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
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
      <label className="text-sm">
        <span className="mb-1 block text-xs opacity-60">Nickname (optional)</span>
        <input name="displayName" placeholder="Truck card" className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Adding…" : "Add card"}
      </button>
      {state.error ? <p className="w-full text-sm text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="w-full text-sm text-emerald-600">Card added.</p> : null}
    </form>
  );
}
