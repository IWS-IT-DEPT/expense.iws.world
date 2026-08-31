import Link from "next/link";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { money, shortDate, weekBounds } from "@/lib/format";
import { checkExpenseLine, isBlocked } from "@/lib/expense-checks";

import { SubmitWeekButton } from "./submit-week-button";

const OPEN = ["draft", "rejected"] as const;

export default async function WeeklyReportPage() {
  const user = await requireUser();
  const { start, end } = weekBounds(new Date());

  const [openCards, openItems, thisWeekReport] = await Promise.all([
    db.query.pendingExpenses.findMany({
      where: and(
        eq(pendingExpenses.userId, user.id),
        inArray(pendingExpenses.status, [...OPEN]),
        isNull(pendingExpenses.reportId),
        lte(pendingExpenses.purchaseDate, end),
      ),
      with: { entity: true, category: true, card: true, receipts: { columns: { id: true } } },
      orderBy: (t, { asc }) => [asc(t.purchaseDate)],
    }),
    db.query.expenseItems.findMany({
      where: and(
        eq(expenseItems.userId, user.id),
        inArray(expenseItems.status, [...OPEN]),
        isNull(expenseItems.reportId),
        lte(expenseItems.itemDate, end),
      ),
      with: { entity: true, category: true, receipts: { columns: { id: true } } },
      orderBy: (t, { asc }) => [asc(t.itemDate)],
    }),
    db.query.expenseReports.findFirst({
      where: and(eq(expenseReports.userId, user.id), eq(expenseReports.periodStart, start)),
    }),
  ]);

  const oop = openItems.filter((i) => i.kind === "out_of_pocket");
  const mileage = openItems.filter((i) => i.kind === "mileage");

  const cardCheck = (r: (typeof openCards)[number]) =>
    checkExpenseLine({
      kind: "card",
      amountCents: r.amountCents,
      entityId: r.entityId,
      locationId: r.locationId,
      categoryId: r.categoryId,
      businessPurpose: r.businessPurpose,
      unitId: r.unitId,
      jobId: r.jobId,
      cardId: r.cardId,
      receiptCount: r.receipts.length,
      costingMode: r.entity?.costingMode as CostingMode | undefined,
      categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
    });
  const itemCheck = (r: (typeof openItems)[number]) =>
    checkExpenseLine({
      kind: r.kind,
      amountCents: r.amountCents,
      entityId: r.entityId,
      locationId: r.locationId,
      categoryId: r.categoryId,
      businessPurpose: r.businessPurpose,
      unitId: r.unitId,
      jobId: r.jobId,
      receiptCount: r.receipts.length,
      costingMode: r.entity?.costingMode as CostingMode | undefined,
      categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
    });

  const attention: { label: string; issues: string[] }[] = [];
  for (const r of openCards) {
    const c = cardCheck(r);
    if (isBlocked(c)) attention.push({ label: `${r.merchant} · ${money(r.amountCents)}`, issues: c.map((x) => x.message) });
  }
  for (const r of openItems) {
    const c = itemCheck(r);
    if (isBlocked(c))
      attention.push({
        label: `${r.kind === "mileage" ? "Mileage" : "Out of pocket"} · ${money(r.amountCents)}`,
        issues: c.map((x) => x.message),
      });
  }

  const total =
    openCards.reduce((s, r) => s + r.amountCents, 0) +
    openItems.reduce((s, r) => s + r.amountCents, 0);
  const toSubmit = openCards.length + openItems.length;
  const locked = thisWeekReport?.status === "reconciled" || thisWeekReport?.status === "approved";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Weekly Report</h1>
        <p className="text-sm opacity-70">
          {shortDate(start)} – {shortDate(end)} · due <strong>end of day Friday</strong>. Look over
          everything you logged this week, add anything you missed, then submit.
        </p>
      </div>

      {locked ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
          This week&apos;s report is filed and locked ({thisWeekReport?.status}). New expenses go on
          next week&apos;s report.
        </p>
      ) : null}

      {attention.length > 0 && !locked && (
        <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">Needs attention before you can submit</p>
          <ul className="space-y-1">
            {attention.map((a, i) => (
              <li key={i}>
                <span className="opacity-80">{a.label}</span> — {a.issues.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReportSection title={`Card purchases (${openCards.length})`} rows={openCards.map((r) => ({
        id: r.id,
        left: `${shortDate(r.purchaseDate)} · ${r.merchant}${r.card ? ` · ${r.card.displayName ?? r.card.last4}` : ""}`,
        right: money(r.amountCents),
        bad: isBlocked(cardCheck(r)),
      }))} />

      <ReportSection title={`Out of pocket (${oop.length})`} rows={oop.map((r) => ({
        id: r.id,
        left: `${shortDate(r.itemDate)} · ${r.category?.name ?? "?"}`,
        right: money(r.amountCents),
        bad: isBlocked(itemCheck(r)),
      }))} />

      <ReportSection title={`Mileage (${mileage.length})`} rows={mileage.map((r) => ({
        id: r.id,
        left: `${shortDate(r.itemDate)} · ${r.miles ?? "?"} mi${r.tripFrom ? ` · ${r.tripFrom}→${r.tripTo ?? "?"}` : ""}`,
        right: money(r.amountCents),
        bad: isBlocked(itemCheck(r)),
      }))} />

      <div className="flex items-center justify-between border-t border-black/10 pt-3 dark:border-white/15">
        <span className="text-sm font-medium">Week total</span>
        <span className="font-semibold">{money(total)}</span>
      </div>

      {!locked && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="opacity-60">Missing something?</span>
            <Link href="/expenses/new" className="underline">
              Log a purchase
            </Link>
            <Link href="/expenses/out-of-pocket" className="underline">
              Out of pocket
            </Link>
            {user.mileageEligible && (
              <Link href="/expenses/mileage" className="underline">
                Mileage
              </Link>
            )}
          </div>
          <SubmitWeekButton
            periodStart={start}
            periodEnd={end}
            disabled={attention.length > 0}
            count={toSubmit}
          />
        </>
      )}
    </div>
  );
}

function ReportSection({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; left: string; right: string; bad: boolean }[];
}) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm opacity-50">None</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span className={r.bad ? "text-amber-600 dark:text-amber-400" : ""}>
                {r.bad ? "⚠ " : ""}
                {r.left}
              </span>
              <span>{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
