import Link from "next/link";
import { forbidden } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { MileageFlagChips } from "@/app/components/mileage-flag-chips";
import { db } from "@/db";
import { expenseItems, users } from "@/db/schema";
import { canSeePayroll, requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";
import { computeMileageFlags } from "@/lib/mileage-flags";

import { STATUS_LABEL } from "../../expenses/expense-row";

const LIMIT = 300;
const COUNTED = ["submitted", "reconciled", "approved"] as const;

const field =
  "w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20";
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n1 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const odo = (v: string) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 });

type Params = { from?: string; to?: string; user?: string; flagged?: string };

/**
 * Payroll's view of everyone's mileage: per-person totals and outliers, plus every
 * line with its odometer readings and review flags, so anything odd can be questioned.
 * Flags are computed over each person's whole history, whatever the date filter.
 */
export default async function MileageAuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireUser();
  if (!canSeePayroll(me)) forbidden();
  const p = await searchParams;

  const all = await db
    .select({
      id: expenseItems.id,
      userId: expenseItems.userId,
      userName: users.name,
      date: expenseItems.itemDate,
      status: expenseItems.status,
      miles: expenseItems.miles,
      cents: expenseItems.amountCents,
      oStart: expenseItems.odometerStart,
      oEnd: expenseItems.odometerEnd,
      personal: expenseItems.personalMiles,
      personalNote: expenseItems.personalMilesNote,
      from: expenseItems.tripFrom,
      to: expenseItems.tripTo,
      purpose: expenseItems.businessPurpose,
    })
    .from(expenseItems)
    .innerJoin(users, eq(users.id, expenseItems.userId))
    .where(and(eq(expenseItems.kind, "mileage"), inArray(expenseItems.status, [...COUNTED])))
    .orderBy(desc(expenseItems.itemDate), desc(expenseItems.createdAt));

  const flags = computeMileageFlags(
    all.map((r) => ({ id: r.id, userId: r.userId, itemDate: r.date, odometerStart: r.oStart, odometerEnd: r.oEnd })),
  );

  const people = await db.query.users.findMany({ columns: { id: true, name: true }, orderBy: [asc(users.name)] });

  const inRange = all.filter(
    (r) =>
      (!isDate(p.from) || r.date >= p.from!) &&
      (!isDate(p.to) || r.date <= p.to!) &&
      (!p.user || !UUID.test(p.user) || r.userId === p.user),
  );
  const shown = inRange.filter((r) => p.flagged !== "1" || (flags.get(r.id)?.length ?? 0) > 0);

  // Per-person summary over the filtered range.
  const stats = new Map<
    string,
    { name: string; trips: number; miles: number; personal: number; cents: number; longest: number; perDay: Map<string, number>; flagged: number; noOdo: number }
  >();
  for (const r of inRange) {
    const s =
      stats.get(r.userId) ??
      { name: r.userName, trips: 0, miles: 0, personal: 0, cents: 0, longest: 0, perDay: new Map(), flagged: 0, noOdo: 0 };
    const miles = Number(r.miles ?? 0);
    s.trips++;
    s.miles += miles;
    s.personal += Number(r.personal ?? 0);
    s.cents += r.cents;
    s.longest = Math.max(s.longest, miles);
    s.perDay.set(r.date, (s.perDay.get(r.date) ?? 0) + miles);
    if (flags.get(r.id)?.length) s.flagged++;
    if (r.oStart === null) s.noOdo++;
    stats.set(r.userId, s);
  }
  const summary = [...stats.entries()]
    .map(([id, s]) => ({
      id,
      ...s,
      avg: s.trips ? s.miles / s.trips : 0,
      busiest: Math.max(0, ...s.perDay.values()),
    }))
    .sort((a, b) => b.flagged - a.flagged || b.miles - a.miles);

  const filtered = Object.values(p).some(Boolean);
  const qs = (patch: Partial<Params>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...p, ...patch })) if (v) u.set(k, v);
    return `/payroll/mileage?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Mileage Audit</h1>
        <p className="text-sm opacity-70">
          Every turned-in mileage line with its odometer readings. A ⚑ is a question to ask, not a finding:
          odometer ranges that overlap another of the person&apos;s trips (they may drive more than one vehicle),
          or both readings ending in 0. Employees never see these flags.
        </p>
      </div>

      <form method="get" className="grid gap-3 rounded-lg border border-black/10 p-4 text-sm sm:grid-cols-5 dark:border-white/15">
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">From</span>
          <input type="date" name="from" defaultValue={p.from ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">To</span>
          <input type="date" name="to" defaultValue={p.to ?? ""} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Employee</span>
          <select name="user" defaultValue={p.user ?? ""} className={field}>
            <option value="">Everyone</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium opacity-70">Show</span>
          <select name="flagged" defaultValue={p.flagged ?? ""} className={field}>
            <option value="">All lines</option>
            <option value="1">Flagged only</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Apply
          </button>
          {filtered ? (
            <Link href="/payroll/mileage" className="px-2 py-2 text-sm underline opacity-70">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">By employee</h2>
        {summary.length === 0 ? (
          <p className="text-sm opacity-60">No mileage in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-black/10 text-xs opacity-70 dark:border-white/15">
                <tr>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 text-right font-medium">Trips</th>
                  <th className="px-3 py-2 text-right font-medium">Business mi</th>
                  <th className="px-3 py-2 text-right font-medium">Avg / trip</th>
                  <th className="px-3 py-2 text-right font-medium">Longest trip</th>
                  <th className="px-3 py-2 text-right font-medium">Busiest day</th>
                  <th className="px-3 py-2 text-right font-medium">Personal mi</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">Flagged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {summary.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-medium">
                      <Link href={qs({ user: s.id })} className="underline">
                        {s.name}
                      </Link>
                      {s.noOdo > 0 ? (
                        <span className="ml-1 text-xs opacity-60">({s.noOdo} without odometer)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.trips}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n1(s.miles)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n1(s.avg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n1(s.longest)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n1(s.busiest)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n1(s.personal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(s.cents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.flagged > 0 ? (
                        <Link
                          href={qs({ user: s.id, flagged: "1" })}
                          className="font-medium text-amber-700 underline dark:text-amber-300"
                        >
                          ⚑ {s.flagged}
                        </Link>
                      ) : (
                        <span className="opacity-50">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Lines ({shown.length}
          {shown.length > LIMIT ? `, showing newest ${LIMIT}` : ""})
        </h2>
        {shown.length === 0 ? (
          <p className="text-sm opacity-60">Nothing matches.</p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
            {shown.slice(0, LIMIT).map((r) => {
              const route = [r.from, r.to].filter(Boolean).join(" → ");
              const driven = r.oStart !== null && r.oEnd !== null ? Number(r.oEnd) - Number(r.oStart) : null;
              return (
                <li key={r.id}>
                  <Link
                    href={`/expenses/${r.id}`}
                    className="block space-y-1 px-3 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>
                        <span className="tabular-nums opacity-70">{shortDate(r.date)}</span>{" "}
                        <span className="font-medium">{r.userName}</span>
                      </span>
                      <span className="text-xs">
                        <span className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>{" "}
                        <span className="font-semibold tabular-nums">{money(r.cents)}</span>
                      </span>
                    </span>
                    <span className="block text-xs opacity-80">
                      {r.oStart !== null && r.oEnd !== null
                        ? `Odometer ${odo(r.oStart)} → ${odo(r.oEnd)} (${n1(driven ?? 0)} driven)`
                        : "No odometer (entered before odometer readings)"}
                      {" · "}
                      <strong>{r.miles ? n1(Number(r.miles)) : "?"} business mi</strong>
                      {r.personal && Number(r.personal) > 0
                        ? ` · ${n1(Number(r.personal))} personal${r.personalNote ? ` (${r.personalNote})` : ""}`
                        : ""}
                    </span>
                    {route || r.purpose ? (
                      <span className="block truncate text-xs opacity-60">
                        {[route, r.purpose].filter(Boolean).join(" — ")}
                      </span>
                    ) : null}
                    {flags.get(r.id)?.length ? <MileageFlagChips flags={flags.get(r.id)} detailed /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
