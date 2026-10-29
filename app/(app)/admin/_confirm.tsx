"use client";

import { useState, type ReactNode } from "react";

import { SubmitButton } from "@/app/components/submit-button";

import { inputClass } from "./_ui";

export interface GuardedField {
  name: string;
  label: string;
  original: string;
  type?: string;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "decimal" | "text";
  /** Tailwind width/extra classes for the input */
  className?: string;
  hint?: string;
}

/**
 * One or more "identifying" inputs (a code, a number, a rate). Changing any of
 * them reveals the consequences and requires typing `phrase` before the form
 * can be saved. The field is posted as `confirmChange`; the server re-checks it.
 */
export function ChangeGuard({
  fields,
  phrase,
  phraseLabel,
  title,
  bullets,
}: {
  fields: GuardedField[];
  phrase: string;
  phraseLabel: string;
  title: string;
  bullets: string[];
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, f.original])));
  const changed = fields.some((f) => (values[f.name] ?? "").trim() !== f.original);

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="mb-1 block font-medium">{f.label}</span>
          <input
            name={f.name}
            type={f.type ?? "text"}
            value={values[f.name]}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            required={f.required ?? true}
            maxLength={f.maxLength}
            placeholder={f.placeholder}
            inputMode={f.inputMode}
            className={`${inputClass} ${f.className ?? "w-full"}`}
          />
          {f.hint ? <span className="mt-1 block text-xs opacity-60">{f.hint}</span> : null}
        </label>
      ))}
      {changed ? (
        <div className="space-y-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">{title}</p>
          <ul className="list-disc space-y-1 pl-5">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <label className="block">
            <span className="mb-1 block font-medium">
              To confirm, type {phraseLabel} <span className="font-mono">{phrase}</span> below
            </span>
            <input
              name="confirmChange"
              required
              autoComplete="off"
              spellCheck={false}
              pattern={phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}
              title={`Type ${phrase} exactly`}
              className={`${inputClass} w-56 font-mono`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Delete control: the button stays disabled until `phrase` is typed. */
export function TypedDelete({
  id,
  phrase,
  consequences,
  buttonLabel,
  action,
}: {
  id: string;
  phrase: string;
  consequences: ReactNode[];
  buttonLabel: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  return (
    <form action={action} className="space-y-3 rounded-lg border border-red-500/50 bg-red-500/5 p-4 text-sm">
      <input type="hidden" name="id" value={id} />
      <p className="font-semibold text-red-700 dark:text-red-400">This is permanent. There is no undo.</p>
      <ul className="list-disc space-y-1 pl-5">
        {consequences.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
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
        {buttonLabel}
      </SubmitButton>
    </form>
  );
}
