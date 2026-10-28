"use client";

import { useState } from "react";

import { inputClass } from "../../_ui";

/**
 * Role + Active, the two settings that can lock someone out. Deactivating shows
 * the consequences and requires typing the person's email before the form will
 * save (the server re-checks). Admin is never assigned here — it comes only from
 * membership of the Microsoft 365 group mapped to Admin.
 */
export function SensitiveFields({
  email,
  name,
  originalRole,
  originalOverride,
  initialChoice,
  originalActive,
  roleOptions,
  drivenRoles,
  isSelf,
}: {
  email: string;
  name: string;
  originalRole: string;
  /** role was assigned by hand (Microsoft 365 groups can't change it) */
  originalOverride: boolean;
  /** "auto" or the role currently pinned */
  initialChoice: string;
  originalActive: boolean;
  /** assignable roles (never includes admin) */
  roleOptions: string[];
  /** roles currently decided by Microsoft 365 groups */
  drivenRoles: string[];
  isSelf: boolean;
}) {
  const [choice, setChoice] = useState(initialChoice);
  const [active, setActive] = useState(originalActive);

  const deactivating = originalActive && !active;
  const isAdmin = originalRole === "admin";

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1 block text-sm font-medium">Role</span>
        {isAdmin || isSelf ? (
          <>
            <input type="hidden" name="role" value={initialChoice} />
            <p className="text-sm">
              <span className="rounded bg-black/5 px-2 py-1 font-medium dark:bg-white/10">{originalRole}</span>
              {originalOverride ? <span className="ml-2 text-xs opacity-60">set manually</span> : null}
            </p>
            <p className="mt-1 text-xs opacity-60">
              {isAdmin
                ? "Admin can't be given or taken away in the app. It comes only from membership of the Microsoft 365 group mapped to Admin (Settings → Roles & groups). To remove it, remove them from that group."
                : "You can't change your own role — that could lock everyone out. Ask another admin."}
            </p>
          </>
        ) : (
          <>
            <select name="role" value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass}>
              <option value="auto">Automatic — from their Microsoft 365 groups</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {drivenRoles.includes(r) ? " — set manually" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs opacity-60">
              {choice === "auto"
                ? "Follows their Microsoft 365 groups (Cardholder if they're in none), re-checked at every sign-in."
                : drivenRoles.includes(choice)
                  ? "Set by hand: this role stays no matter what their Microsoft 365 groups say."
                  : "Set by hand."}
              {originalOverride && choice !== "auto" ? " (Currently pinned.)" : ""}
            </p>
          </>
        )}
      </div>

      <div>
        {isSelf ? (
          <>
            <input type="hidden" name="active" value="on" />
            <p className="text-sm opacity-70">You can&apos;t deactivate your own account.</p>
          </>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-1"
            />
            <span>
              Active{" "}
              <span className="text-xs opacity-60">— untick to block their access without deleting anything</span>
            </span>
          </label>
        )}
      </div>

      {deactivating ? (
        <div className="space-y-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">Deactivating {name}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>They are blocked immediately: they can&apos;t open receipts, upload, or use reports and exports.</li>
            <li>Their expenses, receipts and approval history stay exactly as they are.</li>
            <li>
              Anything of theirs that&apos;s waiting on someone stays in the queue — and they stop getting
              reminder emails and notifications.
            </li>
            <li>You can turn them back on at any time.</li>
          </ul>
          <label className="block">
            <span className="mb-1 block font-medium">
              To confirm, type their email <span className="font-mono">{email}</span> below
            </span>
            <input
              name="confirmEmail"
              required
              autoComplete="off"
              spellCheck={false}
              pattern={email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}
              title={`Type ${email} exactly`}
              className={`${inputClass} w-full font-mono`}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
