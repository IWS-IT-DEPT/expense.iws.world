import Link from "next/link";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { money, shortDate, weekBounds } from "@/lib/format";
import { checkExpenseLine, isBlocked, loadPolicy } from "@/lib/expense-checks";
import {
  submitAllReadyCardExpenses,
  submitCardExpense,
} from "@/app/(app)/expenses/actions";

import { SubmitWeekButton } from "./submit-week-button";

const STATUS_LABEL: Record<string, string> = {
  draft: "not submitted",
  rejected: "sent back",
  submitted: "with accounting",
  reconciled: "reconciled",
  approved: "approved",
};

export default async function WeeklyReportPage() {
  const user = await requireUser();
  const policy = await loadPolicy();
  const { start, end } = weekBounds(new Date());

  const [weekCards, openItems, thisWeekReport] = await Promise.all([
    db.query.pendingExpenses.findMany({
      where: and(
        eq(pendingExpenses.userId, user.id),
        gte(pendingExpenses.purchaseDate, start),
        lte(pendingExpenses.purchaseDate, end),
      ),
      with: { entity: true, category: true, card: true, receipts: { columns: { id: true } } },
      orderBy: (t, { asc }) => [asc(t.purchaseDate)],
    }),
    db.query.expenseItems.findMany({
      where: and(
        eq(expenseItems.userId, user.id),
        inArray(expenseItems.status, ["draft", "rejected"]),
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

  const cardCheck = (r: (typeof weekCards)[number]) =>
    checkExpenseLine(
      {
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
      },
      policy,
    );
  const itemCheck = (r: (typeof openItems)[number]) =>
    checkExpenseLine(
      {
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
      },
      policy,
    );

  const notSubmittedCards = weekCards.filter((c) => c.status === "draft" || c.status === "rejected");
  const readyCount = notSubmittedCards.filter((c) => !isBlocked(cardCheck(c))).length;
  const needsFixCount = notSubmittedCards.length - readyCount;

  const oop = openItems.filter((i) => i.kind === "out_of_pocket");
  const mileage = openItems.filter((i) => i.kind === "mileage");
  const itemsBlocked = openItems.some((i) => isBlocked(itemCheck(i)));

  const weekTotal =
    weekCards.reduce((s, c) => s + c.amountCents, 0) +
    openItems.reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">This Week</h1>
        <p className="text-sm opacity-70">
          {shortDate(start)} – {shortDate(end)}. Every expense must be submitted by{" "}
          <strong>end of day Friday</strong>. Card purchases go to accounting as soon as you submit
          them; mileage and out-of-pocket go to payroll together as one report.
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Card purchases ({weekCards.length})
          </h2>
          {readyCount > 0 ? (
            <form action={submitAllReadyCardExpenses}>
              <button className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black">
                Submit {readyCount} ready
              </button>
            </form>
          ) : null}
        </div>

        {weekCards.length === 0 ? (
          <p className="text-sm opacity-60">
            Nothing logged this week.{" "}
            <Link href="/expenses" className="underline">
              Log a purchase
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide opacity-50">
                  <th className="pb-1 pr-3 font-medium">Date</th>
                  <th className="pb-1 pr-3 font-medium">Merchant</th>
                  <th className="pb-1 pl-3 text-right font-medium">Amount</th>
                  <th className="pb-1 pl-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {weekCards.map((c) => {
                  const editable = c.status === "draft" || c.status === "rejected";
                  const rejected = c.status === "rejected";
                  const blocked = editable && isBlocked(cardCheck(c));
                  return (
                    <tr
                      key={c.id}
                      className={`border-t border-black/5 dark:border-white/10 ${
                        rejected ? "bg-red-500/5" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums opacity-70">
                        {shortDate(c.purchaseDate)}
                      </td>
                      <td
                        className={`py-1.5 pr-3 ${
                          rejected
                            ? "text-red-600 dark:text-red-400"
                            : blocked
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                        }`}
                      >
                        {c.merchant}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                        {money(c.amountCents)}
                      </td>
                      <td className="py-1.5 pl-3 text-right">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {rejected ? (
                            <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
                              sent back
                            </span>
                          ) : null}
                          {editable && blocked ? (
                            <Link
                              href={`/expenses/${c.id}`}
                              className="text-amber-600 underline dark:text-amber-400"
                            >
                              needs info
                            </Link>
                          ) : editable && !blocked ? (
                            <form action={submitCardExpense}>
                              <input type="hidden" name="id" value={c.id} />
                              <button className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white">
                                submit
                              </button>
                            </form>
                          ) : (
                            <span className="opacity-70">{STATUS_LABEL[c.status] ?? c.status}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {needsFixCount > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {needsFixCount} purchase{needsFixCount > 1 ? "s need" : " needs"} more info before it can
            be submitted.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Reimbursements to submit ({openItems.length})
        </h2>
        {openItems.length === 0 ? (
          <p className="text-sm opacity-60">No out-of-pocket or mileage this week.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide opacity-50">
                  <th className="pb-1 pr-3 font-medium">Date</th>
                  <th className="pb-1 pr-3 font-medium">Type</th>
                  <th className="pb-1 pl-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...oop, ...mileage].map((i) => {
                  const blocked = isBlocked(itemCheck(i));
                  const rejected = i.status === "rejected";
                  return (
                    <tr
                      key={i.id}
                      className={`border-t border-black/5 dark:border-white/10 ${
                        rejected ? "bg-red-500/5" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums opacity-70">
                        {shortDate(i.itemDate)}
                      </td>
                      <td
                        className={`py-1.5 pr-3 ${
                          rejected
                            ? "text-red-600 dark:text-red-400"
                            : blocked
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                        }`}
                      >
                        {rejected ? (
                          <span className="mr-1 rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
                            sent back
                          </span>
                        ) : blocked ? (
                          "⚠ "
                        ) : null}
                        {i.kind === "mileage"
                          ? `Mileage · ${i.miles ?? "?"} mi`
                          : "Out of pocket"}
                        {blocked ? (
                          <>
                            {" "}
                            <Link href={`/expenses/${i.id}`} className="underline">
                              fix
                            </Link>
                          </>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                        {money(i.amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {openItems.length > 0 ? (
          <SubmitWeekButton
            periodStart={start}
            periodEnd={end}
            disabled={itemsBlocked}
            count={openItems.length}
          />
        ) : null}
        {thisWeekReport && thisWeekReport.status !== "draft" ? (
          <p className="text-xs opacity-60">
            This week&apos;s reimbursement report is {thisWeekReport.status}.
          </p>
        ) : null}
      </section>

      <div className="flex items-center justify-between border-t border-black/10 pt-3 dark:border-white/15">
        <span className="text-sm font-medium">This week</span>
        <span className="font-semibold">{money(weekTotal)}</span>
      </div>
    </div>
  );
}
