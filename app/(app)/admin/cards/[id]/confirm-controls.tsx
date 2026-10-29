"use client";

import { useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";

import { inputClass } from "../../_ui";

/**
 * Last 4 + Active, the two card settings that can break matching or block a
 * cardholder. Changing either shows the consequences and requires typing the
 * CURRENT last 4 before the form will save (the server re-checks).
 */
export function SensitiveCardFields({
  originalLast4,
  originalActive,
}: {
  originalLast4: string;
  originalActive: boolean;
}) {
  const [last4, setLast4] = useState(originalLast4);
  const [active, setActive] = useState(originalActive);

  const renumbering = last4.trim() !== originalLast4;
  const deactivating = originalActive && !active;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-medium">Last 4 digits</span>
        <input
          name="last4"
          value={last4}
          onChange={(e) => setLast4(e.target.value)}
          required
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{4}"
          title="Exactly 4 digits"
          className={`${inputClass} w-24 font-mono`}
        />
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          name="active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="mt-1"
        />
        <span>
          Active <span className="text-xs opacity-60">— untick to take a lost or closed card out of use</span>
        </span>
      </label>

      {renumbering || deactivating ? (
        <div className="space-y-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          {renumbering ? (
            <>
              <p className="font-semibold">
                Changing the last 4 from <span className="font-mono">{originalLast4}</span> to{" "}
                <span className="font-mono">{last4.trim() || "…"}</span>
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Reconcilers match charges to the statement by these digits. Every past expense on this card
                  will show the new digits.
                </li>
                <li>Only do this to fix a typo. A replacement card with new numbers should be added as a new card.</li>
              </ul>
            </>
          ) : null}
          {deactivating ? (
            <>
              <p className="font-semibold">Turning this card off</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>It no longer appears when someone logs a purchase.</li>
                <li>Expenses already logged on it stay exactly as they are.</li>
                <li>You can turn it back on at any time.</li>
              </ul>
            </>
          ) : null}
          <label className="block">
            <span className="mb-1 block font-medium">
              To confirm, type the current last 4, <span className="font-mono">{originalLast4}</span>, below
            </span>
            <input
              name="confirmLast4"
              required
              autoComplete="off"
              pattern={originalLast4}
              title={`Type ${originalLast4} exactly`}
              className={`${inputClass} w-24 font-mono`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Delete control: the button stays disabled until `delete 1234` is typed. */
export function DeleteCardConfirm({
  id,
  last4,
  label,
  action,
}: {
  id: string;
  last4: string;
  label: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const phrase = `delete ${last4}`;

  return (
    <form action={action} className="space-y-3 rounded-lg border border-red-500/50 bg-red-500/5 p-4 text-sm">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-red-700 dark:text-red-400">This is permanent. There is no undo.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>{label}</strong> will be erased from every list, along with any QuickBooks card-account
          mappings set for it.
        </li>
        <li>No expenses use it today, so no history is lost.</li>
        <li>
          Not sure? <strong>Turn it off instead</strong> (untick Active above) — it can be turned back on.
        </li>
      </ul>
      <label className="block">
        <span className="mb-1 block font-medium">
          To confirm, type{" "}
          <span className="rounded bg-black/10 px-1.5 py-0.5 font-mono dark:bg-white/15">{phrase}</span> below
        </span>
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} w-64 font-mono`}
        />
      </label>
      <SubmitButton
        type="submit"
        disabled={typed !== phrase}
        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        I understand — delete this card
      </SubmitButton>
    </form>
  );
}
