import Link from "next/link";
import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";

import { SubmitButton } from "@/app/components/submit-button";
import { db } from "@/db";
import { expenseItems, users } from "@/db/schema";
import { matchByName, suggestFor } from "@/lib/bamboo-match";
import { BambooError, bambooConfigured, listBambooDirectory, type BambooPerson } from "@/lib/bamboohr";
import { requireRole } from "@/lib/current-user";

import { inputClass } from "../_ui";
import { applyBambooNameMatches, linkBambooEmployee, retryBambooSync, unlinkBambooEmployee } from "../actions";

const box = "rounded-lg border border-black/10 dark:border-white/15";
const personLabel = (p: BambooPerson) =>
  `${p.displayName}${p.jobTitle ? ` · ${p.jobTitle}` : ""}${p.location ? ` · ${p.location}` : ""} (#${p.id})`;

export default async function AdminBambooPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; unlinked?: string; synced?: string; files?: string; failed?: string }>;
}) {
  await requireRole("admin");
  const { linked, unlinked, synced, files, failed } = await searchParams;

  if (!bambooConfigured) {
    return (
      <p className={`${box} p-4 text-sm`}>
        BambooHR isn&apos;t configured. Set <code>BAMBOOHR_SUBDOMAIN</code> and <code>BAMBOOHR_API_KEY</code> in the
        environment.
      </p>
    );
  }

  let people: BambooPerson[];
  try {
    people = await listBambooDirectory();
  } catch (err) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm">
        Couldn&apos;t read the BambooHR directory ({err instanceof BambooError ? err.message : "unexpected error"}).
        Check the API key and that its user can see employees.
      </p>
    );
  }

  const rows = await db.query.users.findMany({
    orderBy: [asc(users.name)],
    columns: { id: true, name: true, email: true, bambooEmployeeId: true, active: true },
  });
  const r = matchByName(rows, people);
  const approvedWhere = eq(expenseItems.status, "approved");
  const [[sent], [waiting], failedLines] = await Promise.all([
    db.select({ n: count() }).from(expenseItems).where(and(approvedWhere, isNotNull(expenseItems.bambooRowId))),
    db.select({ n: count() }).from(expenseItems).where(and(approvedWhere, isNull(expenseItems.bambooRowId))),
    db.query.expenseItems.findMany({
      where: and(approvedWhere, isNull(expenseItems.bambooRowId), isNotNull(expenseItems.bambooSyncError)),
      columns: { id: true, kind: true, itemDate: true, bambooSyncError: true },
      with: { user: { columns: { name: true } } },
      limit: 10,
    }),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const linkedUsers = rows.filter((u) => u.bambooEmployeeId);
  // Anyone not yet claimed by a user can be picked by hand — including the ambiguous names.
  const pickable = [...r.unlinkedPeople, ...r.ambiguous.flatMap((a) => a.people)]
    .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="max-w-3xl space-y-8 text-sm">
      <div>
        <h2 className="text-base font-semibold">BambooHR matching</h2>
        <p className="mt-1 opacity-70">
          Links each app user to their BambooHR employee record by first + last name. The link is the Bamboo employee
          id, so it keeps working after an email change or a termination. Only names that are unique on both sides are
          linked automatically; everything else is for you to settle.
        </p>
      </div>

      {linked ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3">✓ Linked {linked}.</p>
      ) : null}
      {unlinked ? <p className="rounded-lg border border-black/10 p-3 dark:border-white/15">Link removed.</p> : null}
      {synced != null ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3">
          ✓ Sent {synced} line(s) and {files} receipt file(s) to BambooHR{failed && failed !== "0" ? `; ${failed} failed (see below)` : ""}.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Linked", r.alreadyLinked],
            ["Ready to link", r.matches.length],
            ["Need a decision", r.ambiguous.length + r.unmatchedUsers.length],
            ["Bamboo, no app user", r.unlinkedPeople.length],
          ] as [string, number][]
        ).map(([k, v]) => (
          <div key={k} className={`${box} p-3`}>
            <dt className="text-xs opacity-60">{k}</dt>
            <dd className="text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h3 className="font-semibold">Reimbursement sync</h3>
        <p className="opacity-70">
          When payroll approves a reimbursement report, each line is recorded on the employee&apos;s BambooHR file
          (expense / mileage table) and its receipts go to the Receipts &amp; Reimbursements folder. {sent.n} line(s)
          sent, {waiting.n} waiting.
        </p>
        {failedLines.length ? (
          <ul className={`${box} divide-y divide-black/10 dark:divide-white/10`}>
            {failedLines.map((l) => (
              <li key={l.id} className="px-3 py-2">
                <span className="font-medium">{l.user.name}</span>{" "}
                <span className="opacity-60">
                  {l.kind === "mileage" ? "mileage" : "expense"} · {l.itemDate}
                </span>
                <div className="text-xs text-red-700 dark:text-red-300">{l.bambooSyncError}</div>
              </li>
            ))}
          </ul>
        ) : null}
        {waiting.n > 0 ? (
          <form action={retryBambooSync}>
            <SubmitButton
              pendingLabel="Sending…"
              className="rounded-md border border-black/15 px-3.5 py-2 font-medium dark:border-white/20"
            >
              Send the {waiting.n} waiting line(s) now
            </SubmitButton>
          </form>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Ready to link ({r.matches.length})</h3>
        {r.matches.length ? (
          <>
            <ul className={`${box} divide-y divide-black/10 dark:divide-white/10`}>
              {r.matches.map((m) => (
                <li key={m.userId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="font-medium">{m.userName}</span>
                  <span className="opacity-70">
                    → {byId.get(m.bambooId) ? personLabel(byId.get(m.bambooId)!) : `#${m.bambooId}`}
                  </span>
                </li>
              ))}
            </ul>
            <form action={applyBambooNameMatches}>
              <SubmitButton
                pendingLabel="Linking…"
                className="rounded-md bg-black px-3.5 py-2 font-medium text-white dark:bg-white dark:text-black"
              >
                Link these {r.matches.length}
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="opacity-60">Nothing waiting.</p>
        )}
      </section>

      {r.ambiguous.length ? (
        <section className="space-y-3">
          <h3 className="font-semibold">Same name more than once ({r.ambiguous.length})</h3>
          <p className="opacity-70">
            Not linked automatically — more than one app user or Bamboo employee shares the name. Pair them below.
          </p>
          <ul className={`${box} divide-y divide-black/10 dark:divide-white/10`}>
            {r.ambiguous.map((a) => (
              <li key={a.name} className="px-3 py-2">
                <span className="font-medium capitalize">{a.name}</span>
                <span className="opacity-70">
                  {" "}
                  — {a.users.length} app user(s), {a.people.length} Bamboo employee(s)
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="font-semibold">App users with no Bamboo match ({r.unmatchedUsers.length})</h3>
        {r.unmatchedUsers.length ? (
          <ul className={`${box} divide-y divide-black/10 dark:divide-white/10`}>
            {r.unmatchedUsers.map((u) => {
              const hints = suggestFor(u, pickable);
              const hintIds = new Set(hints.map((h) => h.id));
              return (
              <li key={u.id} className="space-y-2 px-3 py-2">
                <div>
                  <Link href={`/admin/users/${u.id}`} className="font-medium underline">
                    {u.name}
                  </Link>{" "}
                  <span className="opacity-60">{u.email}</span>
                </div>
                <form action={linkBambooEmployee} className="flex flex-wrap gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="bambooId" required defaultValue="" className={`${inputClass} min-w-0 flex-1`}>
                    <option value="" disabled>
                      Pick their Bamboo record…
                    </option>
                    {hints.length ? (
                      <optgroup label="Possible matches">
                        {hints.map((p) => (
                          <option key={p.id} value={p.id}>
                            {personLabel(p)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <optgroup label={hints.length ? "Everyone else" : "All Bamboo employees"}>
                      {pickable
                        .filter((p) => !hintIds.has(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {personLabel(p)}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  <SubmitButton
                    pendingLabel="Linking…"
                    className="rounded-md border border-black/15 px-3 py-1.5 font-medium dark:border-white/20"
                  >
                    Link
                  </SubmitButton>
                </form>
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="opacity-60">Everyone is linked or ready to link.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Linked ({linkedUsers.length})</h3>
        {linkedUsers.length ? (
          <ul className={`${box} divide-y divide-black/10 dark:divide-white/10`}>
            {linkedUsers.map((u) => {
              const p = byId.get(u.bambooEmployeeId!);
              return (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="font-medium">{u.name}</span>{" "}
                    <span className="opacity-70">
                      → {p ? personLabel(p) : `#${u.bambooEmployeeId} (not in the current directory)`}
                    </span>
                  </span>
                  <form action={unlinkBambooEmployee}>
                    <input type="hidden" name="userId" value={u.id} />
                    <SubmitButton pendingLabel="…" className="text-xs underline opacity-70">
                      Unlink
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="opacity-60">No links yet.</p>
        )}
      </section>
    </div>
  );
}
