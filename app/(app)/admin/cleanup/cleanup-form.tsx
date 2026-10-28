"use client";

import { useMemo, useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";

import { inputClass } from "../_ui";
import { runCleanup } from "./actions";

export interface CleanupUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  isMe: boolean;
  cardExpenses: number;
  items: number;
  reports: number;
  receipts: number;
  cards: number;
}

type Mode = "expenses" | "accounts";

/** Pick test users, pick what to remove, type the phrase to confirm. */
export function CleanupForm({ users }: { users: CleanupUser[] }) {
  const [mode, setMode] = useState<Mode>("expenses");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");

  // Your own account can never be deleted (only its test expenses cleared).
  const selectable = (u: CleanupUser) => mode === "expenses" || !u.isMe;
  const selected = useMemo(() => users.filter((u) => picked.has(u.id) && selectable(u)), [users, picked, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = selected.reduce(
    (t, u) => ({
      cardExpenses: t.cardExpenses + u.cardExpenses,
      items: t.items + u.items,
      reports: t.reports + u.reports,
      receipts: t.receipts + u.receipts,
      cards: t.cards + u.cards,
    }),
    { cardExpenses: 0, items: 0, reports: 0, receipts: 0, cards: 0 },
  );

  const phrase = mode === "accounts" ? `delete ${selected.length} users` : `clear ${selected.length} users`;
  const ok = selected.length > 0 && typed === phrase;

  function toggle(id: string) {
    setTyped("");
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <form action={runCleanup} className="space-y-6 text-sm">
      <input type="hidden" name="mode" value={mode} />
      {selected.map((u) => (
        <input key={u.id} type="hidden" name="u" value={u.id} />
      ))}

      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">1. What do you want to remove?</legend>
        {(
          [
            ["expenses", "Only their expenses", "Keeps the accounts (and cards). Removes every card purchase, out-of-pocket and mileage entry, weekly report and receipt they made."],
            ["accounts", "The accounts and everything they did", "Removes the people entirely — their cards, expenses, reports, receipts and approval history. They would have to sign in again to be re-created."],
          ] as [Mode, string, string][]
        ).map(([v, label, help]) => (
          <label key={v} className="flex items-start gap-3 rounded-lg border border-black/10 p-3 dark:border-white/15">
            <input
              type="radio"
              checked={mode === v}
              onChange={() => {
                setMode(v);
                setTyped("");
              }}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{label}</span>
              <span className="block text-xs opacity-70">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="font-semibold">2. Pick the test users ({selected.length} selected)</legend>
          <span className="flex gap-3 text-xs">
            <button
              type="button"
              className="underline"
              onClick={() => {
                setTyped("");
                setPicked(new Set(users.filter((u) => !u.isMe).map((u) => u.id)));
              }}
            >
              Everyone except me
            </button>
            <button
              type="button"
              className="underline"
              onClick={() => {
                setTyped("");
                setPicked(new Set());
              }}
            >
              Clear
            </button>
          </span>
        </div>
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
          {users.map((u) => {
            const can = selectable(u);
            return (
              <li key={u.id}>
                <label className={`flex items-start gap-3 px-3 py-2.5 ${can ? "cursor-pointer" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    disabled={!can}
                    checked={picked.has(u.id) && can}
                    onChange={() => toggle(u.id)}
                    className="mt-1 h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{u.name}</span>
                    {u.isMe ? <span className="ml-2 text-xs opacity-60">(you{mode === "accounts" ? " — can't be deleted" : ""})</span> : null}
                    {!u.active ? <span className="ml-2 text-xs text-red-600">inactive</span> : null}
                    <span className="block truncate text-xs opacity-60">
                      {u.email} · {u.role}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs opacity-70">
                    {u.cardExpenses + u.items} expenses
                    <br />
                    {u.receipts} receipts
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <section className="space-y-3 rounded-lg border border-red-500/50 bg-red-500/5 p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-400">3. Confirm — this is permanent</h3>
        {selected.length === 0 ? (
          <p className="opacity-70">Pick at least one user above.</p>
        ) : (
          <>
            <p>
              This will permanently delete{" "}
              <strong>
                {mode === "accounts" ? `${selected.length} user account${selected.length === 1 ? "" : "s"}, ` : ""}
                {totals.cardExpenses} card expense{totals.cardExpenses === 1 ? "" : "s"}, {totals.items} out-of-pocket / mileage
                entr{totals.items === 1 ? "y" : "ies"}, {totals.reports} weekly report{totals.reports === 1 ? "" : "s"} and{" "}
                {totals.receipts} receipt file{totals.receipts === 1 ? "" : "s"}
                {mode === "accounts" ? `, and ${totals.cards} registered card${totals.cards === 1 ? "" : "s"}` : ""}
              </strong>
              . It can&apos;t be undone and there is no recycle bin.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs opacity-80">
              <li>Approved and exported expenses are deleted too — make sure nothing here is real.</li>
              <li>Spreadsheets and PDFs already exported are not touched.</li>
              <li>Settings, entities, locations, categories and QuickBooks setup are not touched.</li>
            </ul>
            <label className="block">
              <span className="mb-1 block font-medium">
                To confirm, type <span className="rounded bg-black/10 px-1.5 py-0.5 font-mono dark:bg-white/15">{phrase}</span>
              </span>
              <input
                name="confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} w-72 font-mono`}
              />
            </label>
          </>
        )}
        <SubmitButton
          disabled={!ok}
          pendingLabel="Deleting… this can take a minute"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {mode === "accounts" ? "Permanently delete these users" : "Permanently delete their expenses"}
        </SubmitButton>
      </section>
    </form>
  );
}
