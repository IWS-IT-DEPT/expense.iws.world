"use client";

import { useState } from "react";

import { inputClass } from "../../_ui";

/**
 * Role + Active, the two settings that can lock someone out or grant power.
 * Deactivating, or touching the admin role, shows the consequences and requires
 * typing the person's email before the form will save (the server re-checks).
 */
export function SensitiveFields({
  email,
  name,
  originalRole,
  originalActive,
  roleOptions,
  roleLockedReason,
  isSelf,
}: {
  email: string;
  name: string;
  originalRole: string;
  originalActive: boolean;
  roleOptions: string[];
  /** when set the role can't be edited here — shown instead of the dropdown */
  roleLockedReason?: string;
  isSelf: boolean;
}) {
  const [role, setRole] = useState(originalRole);
  const [active, setActive] = useState(originalActive);

  const deactivating = originalActive && !active;
  const adminChange = role !== originalRole && (role === "admin" || originalRole === "admin");
  const needsConfirm = deactivating || adminChange;

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1 block text-sm font-medium">Role</span>
        {roleLockedReason || isSelf ? (
          <>
            <input type="hidden" name="role" value={originalRole} />
            <p className="text-sm">
              <span className="rounded bg-black/5 px-2 py-1 font-medium dark:bg-white/10">{originalRole}</span>
            </p>
            <p className="mt-1 text-xs opacity-60">
              {isSelf
                ? "You can't change your own role — that could lock everyone out. Ask another admin."
                : roleLockedReason}
            </p>
          </>
        ) : (
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
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

      {needsConfirm ? (
        <div className="space-y-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          {deactivating ? (
            <>
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
            </>
          ) : (
            <>
              <p className="font-semibold">
                {role === "admin" ? `Making ${name} an administrator` : `Removing administrator access from ${name}`}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Admins can see and change everything: users, roles, all expenses and receipts, settings and
                  QuickBooks setup.
                </li>
                <li>
                  Admin access is normally granted by membership of the IT group in Microsoft 365, not here.
                </li>
              </ul>
            </>
          )}
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
