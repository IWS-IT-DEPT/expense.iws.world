import { requireRole } from "@/lib/current-user";
import { MAIL_GROUPS, resolveRecipients, type MailGroup } from "@/lib/mail-settings";

import { DirtyForm } from "../_dirty-form";
import { inputClass } from "../_ui";
import { saveMailRecipients } from "../actions";
import { SendTestButton } from "./send-test-button";

export const dynamic = "force-dynamic";

const SOURCE_LABEL = {
  setting: "set here",
  environment: "from the server environment",
  default: "built-in default",
} as const;

export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole("admin");
  const sp = await searchParams;
  const groups = Object.keys(MAIL_GROUPS) as MailGroup[];
  const resolved = await Promise.all(groups.map((g) => resolveRecipients(g)));
  const redirecting = !!process.env.EMAIL_REDIRECT_TO?.trim();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Email recipients</h2>
        <p className="text-sm opacity-70">
          Who gets the internal alerts when someone submits something to review. Individual notices (sent back,
          approved, reminders, welcome) always go to the person they&apos;re about.
        </p>
      </div>

      {sp.saved ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">✓ Saved.</p>
      ) : null}
      {sp.error ? (
        <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">
          Couldn&apos;t save: {sp.error}
        </p>
      ) : null}
      {redirecting ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          <strong>Test mode is on</strong> (<code>EMAIL_REDIRECT_TO</code>): every email is being sent to one test
          address instead of these.
        </p>
      ) : null}

      <DirtyForm
        action={saveMailRecipients}
        resetKey={resolved.map((r) => r.saved).join("|")}
        className="space-y-6 text-sm"
      >
        {groups.map((g, i) => {
          const m = MAIL_GROUPS[g];
          const r = resolved[i];
          return (
            <div key={g} className="space-y-1.5">
              <label htmlFor={g} className="block font-medium">
                {m.label}
              </label>
              <input
                id={g}
                name={g}
                defaultValue={r.saved}
                placeholder={r.addresses.join(", ")}
                autoComplete="off"
                className={`${inputClass} w-full`}
              />
              <p className="text-xs opacity-70">
                {m.help} Separate several addresses with commas.
              </p>
              <p className="text-xs opacity-70">
                Currently sending to <strong>{r.addresses.join(", ")}</strong> ({SOURCE_LABEL[r.source]}).
                {r.source !== "setting" ? " Type addresses above to override." : " Clear the box to go back to the default."}
              </p>
            </div>
          );
        })}
      </DirtyForm>

      <section className="space-y-3 border-t border-black/10 pt-5 dark:border-white/15">
        <h3 className="text-sm font-semibold">Send a test</h3>
        <p className="text-xs opacity-70">
          Sends a short test message to the addresses above so you can confirm the mailbox receives it.
        </p>
        {groups.map((g, i) => (
          <SendTestButton key={g} group={g} label={MAIL_GROUPS[g].label} to={resolved[i].addresses} />
        ))}
      </section>
    </div>
  );
}
