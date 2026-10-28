"use client";

import { useState } from "react";

import { SubmitButton } from "@/app/components/submit-button";

import { inputClass } from "../_ui";
import { checkEmailRole } from "../actions";

export function CheckEmail() {
  const [result, setResult] = useState<{ ok: boolean; text: string; lines: string[] } | null>(null);
  return (
    <form
      action={async (fd) => {
        const r = await checkEmailRole(fd);
        setResult(r.ok ? { ok: true, text: r.message, lines: r.lines } : { ok: false, text: r.error, lines: r.lines });
      }}
      className="space-y-2 text-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder="name@iws.world"
          className={`${inputClass} w-full sm:w-72`}
        />
        <SubmitButton
          pendingLabel="Checking…"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-black/15 px-4 font-medium dark:border-white/20"
        >
          Check
        </SubmitButton>
      </div>
      {result ? (
        <div className="space-y-2">
          <p className={result.ok ? "font-medium" : "font-medium text-red-600"}>{result.text}</p>
          {result.lines.length ? (
            <ul className="list-disc space-y-1 rounded-lg border border-black/10 p-3 pl-7 text-xs opacity-90 dark:border-white/15">
              {result.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
