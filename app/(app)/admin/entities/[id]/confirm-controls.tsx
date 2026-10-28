"use client";

import { SubmitButton } from "@/app/components/submit-button";
import { useState } from "react";

import { inputClass } from "../../_ui";

/**
 * Entity code field. Editing it reveals a warning and requires typing the
 * CURRENT code before the form can be saved (the server checks it too).
 */
export function CodeField({ original }: { original: string }) {
  const [value, setValue] = useState(original);
  const changed = value.trim().toUpperCase() !== original;

  return (
    <div className="space-y-3">
      <input
        name="code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        maxLength={12}
        pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,11}"
        title="Letters, digits, - or _ (max 12). Saved in capitals."
        className={`${inputClass} w-32 font-mono uppercase`}
      />
      {changed ? (
        <div className="space-y-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">
            Changing the code from <span className="font-mono">{original}</span> to{" "}
            <span className="font-mono">{value.trim().toUpperCase() || "…"}</span> — read this first
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The code is a <strong>live label</strong>. Every past and future expense, report, chart and
              export will show the new code immediately — including old periods.
            </li>
            <li>
              Files already exported (Excel/PDF), emailed or printed keep the <strong>old</strong> code, so
              they will no longer match what the app shows.
            </li>
            <li>
              Anything outside this app that refers to the entity by its code — spreadsheets, payroll or
              accounting notes, QuickBooks naming conventions — will stop lining up until it&apos;s updated.
            </li>
            <li>
              Amounts, coding, approvals and QuickBooks mappings are <strong>not</strong> affected; they
              follow the entity, not the code.
            </li>
            <li>Other people may be mid-way through entering expenses; the dropdowns will change under them.</li>
          </ul>
          <label className="block">
            <span className="mb-1 block font-medium">
              To confirm, type the current code <span className="font-mono">{original}</span> below
            </span>
            <input
              name="confirmCodeChange"
              required
              autoComplete="off"
              pattern={original}
              title={`Type ${original} exactly`}
              className={`${inputClass} w-40 font-mono`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Delete control: the button stays disabled until `delete CODE` is typed. */
export function DeleteEntityConfirm({
  id,
  code,
  name,
  mappingCount,
  hasQboSettings,
  action,
}: {
  id: string;
  code: string;
  name: string;
  mappingCount: number;
  hasQboSettings: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const phrase = `delete ${code}`;
  const ok = typed === phrase;

  return (
    <form action={action} className="space-y-3 rounded-lg border border-red-500/50 bg-red-500/5 p-4 text-sm">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-red-700 dark:text-red-400">
        This is permanent. There is no undo.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>
            {code} · {name}
          </strong>{" "}
          will be erased and disappear from every list and dropdown.
        </li>
        <li>
          Its QuickBooks setup goes with it: {hasQboSettings ? "company settings" : "no company settings"}
          {mappingCount > 0 ? ` and ${mappingCount} account/class/location mapping${mappingCount === 1 ? "" : "s"}` : ""}.
          You would have to re-enter all of it if you ever add the entity back.
        </li>
        <li>
          Nothing currently uses this entity, so no expenses or reports are affected today — but a
          deleted entity can&apos;t be restored, and re-creating it makes a <em>new</em> entity, not the old one.
        </li>
        <li>
          Not sure? <strong>Retire it instead</strong> (uncheck Active above): it vanishes from dropdowns
          but can be turned back on at any time.
        </li>
      </ul>
      <label className="block">
        <span className="mb-1 block font-medium">
          To confirm, type <span className="rounded bg-black/10 px-1.5 py-0.5 font-mono dark:bg-white/15">{phrase}</span> below
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
        disabled={!ok}
        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        I understand — delete this entity
      </SubmitButton>
    </form>
  );
}
