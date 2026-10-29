import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { cards, entities, expenseItems, locations, pendingExpenses, userRole, users } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { getGroupConfig } from "@/lib/role-groups";
import { shortDate } from "@/lib/format";

import { DirtyForm } from "../../_dirty-form";
import { inputClass } from "../../_ui";
import { SubmitButton } from "@/app/components/submit-button";
import { recheckRole, resendWelcome, updateUser } from "../../actions";
import { SensitiveFields } from "./sensitive-fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ROLE_HELP: Record<string, string> = {
  cardholder: "Everyone's default: their own expenses, weekly report and cards.",
  approver: "Reconcile and give final approval to card charges.",
  accounting: "Reconcile card charges, card reports, and the shared coding lists.",
  payroll: "Reconcile, approve and report on mileage and out-of-pocket reimbursements.",
  admin: "Everything, including Users and Settings.",
};

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string; rolesrc?: string; role?: string }>;
}) {
  const me = await requireRole("admin");
  const { id } = await params;
  const { welcome, rolesrc, role: roleNote } = await searchParams;
  const cfg = await getGroupConfig();
  if (!UUID.test(id)) notFound();

  const u = await db.query.users.findFirst({ where: eq(users.id, id), with: { homeEntity: true } });
  if (!u) notFound();

  const [entityRows, locationRows, [cardCount], [expenseCount], [itemCount]] = await Promise.all([
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
    db.query.locations.findMany({ orderBy: [asc(locations.name)] }),
    db.select({ n: sql<number>`count(*)` }).from(cards).where(eq(cards.userId, id)),
    db.select({ n: sql<number>`count(*)` }).from(pendingExpenses).where(eq(pendingExpenses.userId, id)),
    db.select({ n: sql<number>`count(*)` }).from(expenseItems).where(eq(expenseItems.userId, id)),
  ]);

  const isSelf = me.id === u.id;
  // "Automatic" unless the role is pinned by hand, or it's a plain non-group role like Approver.
  const initialChoice = u.roleOverride
    ? u.role
    : cfg.driven.includes(u.role) || u.role === "cardholder"
      ? "auto"
      : u.role;
  const roleOptions = userRole.enumValues.filter((r) => r !== "admin");

  const formKey = [u.name, u.role, u.roleOverride, u.homeEntityId, u.homeLocationId, u.mileageEligible, u.jobExempt, u.active].join("|");

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link href="/admin/users" className="text-sm underline opacity-70">
          ← Users
        </Link>
        <h2 className="mt-2 text-lg font-semibold">
          {u.name}
          {isSelf ? <span className="ml-2 text-sm font-normal opacity-60">(you)</span> : null}
          {!u.active ? <span className="ml-2 text-sm font-normal text-red-600">inactive</span> : null}
        </h2>
        <p className="text-sm opacity-70">{u.email}</p>
      </div>

      {rolesrc === "override" ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
          ✓ Role set manually to <strong>{roleNote}</strong> — it stays whatever their Microsoft 365 groups say.
        </p>
      ) : rolesrc === "group" ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
          ✓ Found in the Microsoft 365 group for <strong>{roleNote}</strong> — that role has been applied.
        </p>
      ) : rolesrc === "none" ? (
        <p className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          Not in any mapped Microsoft 365 group, so the role is <strong>{roleNote}</strong>.
        </p>
      ) : rolesrc === "unchecked" ? (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Couldn&apos;t check Microsoft 365 groups just now (see Settings → Roles &amp; groups). Their role is{" "}
          <strong>{roleNote}</strong> for now and will be updated from their groups when they sign in.
        </p>
      ) : null}

      {welcome === "sent" ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">
          ✓ Setup email sent to {u.email}.
        </p>
      ) : null}

      <dl className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
        {(
          [
            ["Role", `${u.role}${u.roleOverride ? " (set manually)" : ""} — ${ROLE_HELP[u.role]}`],
            ["Signed in before", u.entraOid ? "Yes" : "Not yet (added in advance)"],
            ["Added", shortDate(u.createdAt)],
            ["Registered cards", String(cardCount.n)],
            ["Card expenses", String(expenseCount.n)],
            ["Out-of-pocket & mileage", String(itemCount.n)],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-3 py-2.5">
            <dt className="opacity-60">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Edit</h3>
        <DirtyForm action={updateUser} resetKey={formKey} className="space-y-5 text-sm">
          <input type="hidden" name="id" value={u.id} />

          <label className="block">
            <span className="mb-1 block font-medium">Name</span>
            <input name="name" defaultValue={u.name} required className={`${inputClass} w-full`} />
          </label>

          <SensitiveFields
            email={u.email}
            name={u.name}
            originalRole={u.role}
            originalOverride={u.roleOverride}
            initialChoice={initialChoice}
            originalActive={u.active}
            roleOptions={roleOptions}
            drivenRoles={cfg.driven}
            isSelf={isSelf}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium">Home entity</span>
              <select name="homeEntityId" defaultValue={u.homeEntityId ?? ""} className={`${inputClass} w-full`}>
                <option value="">— none —</option>
                {entityRows.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Home location</span>
              <select name="homeLocationId" defaultValue={u.homeLocationId ?? ""} className={`${inputClass} w-full`}>
                <option value="">— none —</option>
                {locationRows.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-2">
            <input type="checkbox" name="mileageEligible" defaultChecked={u.mileageEligible} className="mt-1" />
            <span>
              Can log mileage{" "}
              <span className="text-xs opacity-60">— shows the + Mileage button on their My Expenses page</span>
            </span>
          </label>

          <label className="flex items-start gap-2">
            <input type="checkbox" name="jobExempt" defaultChecked={u.jobExempt} className="mt-1" />
            <span>
              Exempt from job codes{" "}
              <span className="text-xs opacity-60">
                — never asked for a job, even on entities that require one (set per entity under Settings → Entities)
              </span>
            </span>
          </label>
        </DirtyForm>
      </section>

      <section className="space-y-2 text-sm">
        <h3 className="font-semibold">Setup email</h3>
        <p className="opacity-70">
          Sends {u.name.split(" ")[0]} the welcome email: how to sign in, add the app to an iPhone, Android or
          computer, and open the how-to guide for their access.
        </p>
        <form action={recheckRole} className="mb-2">
          <input type="hidden" name="id" value={u.id} />
          <SubmitButton
            pendingLabel="Checking…"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-black/15 px-4 font-medium dark:border-white/20"
          >
            Re-check Microsoft 365 groups
          </SubmitButton>
        </form>
        <form action={resendWelcome}>
          <input type="hidden" name="id" value={u.id} />
          <SubmitButton
            pendingLabel="Sending…"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-black/15 px-4 font-medium dark:border-white/20"
          >
            Email setup instructions
          </SubmitButton>
        </form>
      </section>

      <section className="space-y-1 border-t border-black/10 pt-5 text-sm dark:border-white/15">
        <h3 className="font-semibold">Removing someone</h3>
        <p className="opacity-70">
          People can&apos;t be deleted — their expenses, receipts and approvals are the company&apos;s financial
          record. To take someone off, untick <strong>Active</strong> above. It blocks their access
          straight away and can be undone.
        </p>
      </section>
    </div>
  );
}
