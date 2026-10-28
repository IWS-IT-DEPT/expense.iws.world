import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { cards, entities, expenseItems, locations, pendingExpenses, userRole, users } from "@/db/schema";
import { GROUP_DRIVEN, GROUP_SYNC_ENABLED, requireRole } from "@/lib/current-user";
import { shortDate } from "@/lib/format";

import { DirtyForm } from "../../_dirty-form";
import { inputClass } from "../../_ui";
import { updateUser } from "../../actions";
import { SensitiveFields } from "./sensitive-fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ROLE_HELP: Record<string, string> = {
  cardholder: "Everyone's default: their own expenses, weekly report and cards.",
  approver: "Reconcile and give final approval to card charges.",
  accounting: "Reconcile card charges, card reports, and the shared coding lists.",
  payroll: "Reconcile, approve and report on mileage and out-of-pocket reimbursements.",
  admin: "Everything, including Users and Settings.",
};

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("admin");
  const { id } = await params;
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
  const groupDriven = GROUP_DRIVEN.includes(u.role);
  // With group sync on, admin/accounting/payroll come from Microsoft 365 groups
  // and a role typed here would just be reset the next time they use the app.
  const roleLockedReason =
    GROUP_SYNC_ENABLED && groupDriven
      ? `${u.role} comes from their Microsoft 365 group. To change it, change their group membership in Microsoft 365 — a role set here would be reset the next time they use the app.`
      : undefined;
  const roleOptions = GROUP_SYNC_ENABLED
    ? userRole.enumValues.filter((r) => !GROUP_DRIVEN.includes(r))
    : [...userRole.enumValues];

  const formKey = [u.name, u.role, u.homeEntityId, u.homeLocationId, u.mileageEligible, u.active].join("|");

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

      <dl className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
        {(
          [
            ["Role", `${u.role} — ${ROLE_HELP[u.role]}`],
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
            originalActive={u.active}
            roleOptions={roleOptions}
            roleLockedReason={roleLockedReason}
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
        </DirtyForm>
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
