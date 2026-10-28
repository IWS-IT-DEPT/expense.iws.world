import { requireRole } from "@/lib/current-user";
import { getAccountStatus, getGroupName, getLastGraphError, graphConfigured, graphSelfTest } from "@/lib/graph";
import { GROUP_ROLES, getGroupConfig, type Role } from "@/lib/role-groups";

import { DirtyForm } from "../_dirty-form";
import { inputClass } from "../_ui";
import { saveRoleGroups } from "../actions";
import { CheckEmail } from "./check-email";

export const dynamic = "force-dynamic";

const ROLE_INFO: Record<Role, { label: string; help: string }> = {
  admin: { label: "Admin", help: "Everything, including Users, Roles and Settings. Usually the IT group." },
  accounting: { label: "Accounting", help: "Reconcile card charges, card reports and shared lists. Usually Finance." },
  payroll: { label: "Payroll", help: "Reconcile and approve mileage and out-of-pocket reimbursements. Usually HR." },
  approver: { label: "Approver", help: "Final approval of card charges. Leave blank to set approvers by hand on each person's page." },
  cardholder: { label: "Cardholder", help: "" },
};

const SOURCE = { setting: "set here", environment: "from the server environment" } as const;

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await requireRole("admin");
  const sp = await searchParams;
  const lockout = me.entraOid ? await getAccountStatus(me.entraOid) : "unknown";
  const cfg = await getGroupConfig();
  const [test, ...names] = await Promise.all([
    graphSelfTest(),
    ...GROUP_ROLES.map((r) => (cfg.groups[r] ? getGroupName(cfg.groups[r]!) : Promise.resolve(null))),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-semibold">Roles &amp; Microsoft 365 groups</h2>
        <p className="text-sm opacity-70">
          Say which Microsoft 365 group gives each role. Anyone in that group gets the role automatically — when
          you add them (before the welcome email goes out) and every time they sign in.
        </p>
      </div>

      {sp.saved ? <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">✓ Saved.</p> : null}
      {sp.error ? <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">Couldn&apos;t save: {sp.error}</p> : null}

      <div className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
        <p className="font-medium">Microsoft 365 connection</p>
        <p className={test.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
          {test.ok ? "✓ Connected — the app can read group membership." : `⚠ ${test.detail}`}
        </p>
        <p className={`mt-2 ${lockout === "enabled" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
          {lockout === "enabled"
            ? "✓ Instant lock-out is working — a disabled or deleted Microsoft 365 account is blocked within about 30 seconds."
            : "⚠ Instant lock-out can't be confirmed. It needs the application permission User.Read.All (with admin consent); until then a disabled Microsoft 365 account stays signed in to the app until its session expires (up to 10 hours). You can still turn someone off immediately by unticking Active on their user page."}
        </p>
        {!graphConfigured ? null : getLastGraphError() ? (
          <p className="mt-1 text-xs opacity-70">Last error: {getLastGraphError()}</p>
        ) : null}
        {!test.ok ? (
          <p className="mt-1 text-xs opacity-70">
            Without it, roles are still applied at each person&apos;s sign-in (from the groups Microsoft sends), but
            not before the welcome email.
          </p>
        ) : null}
      </div>

      <DirtyForm
        action={saveRoleGroups}
        resetKey={GROUP_ROLES.map((r) => `${cfg.groups[r] ?? ""}${cfg.source[r] ?? ""}`).join("|")}
        className="space-y-5 text-sm"
      >
        {GROUP_ROLES.map((role, i) => {
          const info = ROLE_INFO[role];
          const id = cfg.groups[role];
          return (
            <div key={role} className="space-y-1.5">
              <label htmlFor={role} className="block font-medium">
                {info.label} role ← Microsoft 365 group ID
              </label>
              <input
                id={role}
                name={role}
                defaultValue={cfg.source[role] === "setting" ? id : ""}
                placeholder={id ?? "not mapped"}
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} w-full font-mono`}
              />
              <p className="text-xs opacity-70">{info.help}</p>
              <p className="text-xs opacity-70">
                {id ? (
                  <>
                    Currently: <strong>{names[i] ?? "group found by ID only"}</strong>{" "}
                    <span className="font-mono">({id})</span> — {SOURCE[cfg.source[role]!]}.
                    {cfg.source[role] === "setting" ? " Clear the box to fall back to the server setting." : " Type an ID above to override."}
                  </>
                ) : (
                  "Not mapped — this role is set by hand on each person's page."
                )}
              </p>
            </div>
          );
        })}
        <p className="text-xs opacity-60">
          Find a group&apos;s ID in Microsoft Entra → Groups → the group → Object ID.
        </p>
      </DirtyForm>

      <section className="space-y-2 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <h3 className="font-semibold">How roles are decided</h3>
        <ul className="list-disc space-y-1 pl-5 opacity-80">
          <li>
            <strong>The group wins.</strong> If someone is in a mapped group, that is their role — whatever you pick
            when you add them. Their role is re-checked every time they sign in.
          </li>
          <li>
            In several groups? The highest wins: Admin, then Accounting, then Payroll, then Approver.
          </li>
          <li>
            A role with a group mapped can&apos;t be set by hand: if they leave the group they go back to Cardholder.
            Roles with <em>no</em> group are set manually on a person&apos;s page.
          </li>
          <li>Cardholder is the default for everyone not in a mapped group.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Check someone</h3>
        <p className="text-xs opacity-70">See which role an email address would get, without changing anything.</p>
        <CheckEmail />
      </section>
    </div>
  );
}
