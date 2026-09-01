import Link from "next/link";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { canReview, canSeePayroll, isAdmin, requireUser } from "@/lib/current-user";
import { checkExpenseLine, loadPolicy } from "@/lib/expense-checks";
import { money, weekBounds } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const policy = await loadPolicy();
  const { start, end } = weekBounds(new Date());
  const isApprover = user.role === "approver" || isAdmin(user);

  const myCards = await db.query.pendingExpenses.findMany({
    where: eq(pendingExpenses.userId, user.id),
    with: { entity: true, category: true, receipts: { columns: { id: true } } },
  });

  let cardDraft = 0;
  let cardRejected = 0;
  let cardSubmitted = 0;
  let cardMissingReceipt = 0;
  let cardWeekTotal = 0;
  for (const r of myCards) {
    if (r.status === "draft") cardDraft++;
    else if (r.status === "rejected") cardRejected++;
    else if (r.status === "submitted" || r.status === "reconciled") cardSubmitted++;

    if (r.status !== "cancelled" && r.purchaseDate >= start && r.purchaseDate <= end) {
      cardWeekTotal += r.actualAmountCents ?? r.amountCents;
    }
    if (r.status === "draft" || r.status === "rejected") {
      const needsReceipt = checkExpenseLine(
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
      ).some((c) => c.code === "missing_receipt");
      if (needsReceipt) cardMissingReceipt++;
    }
  }
  const cardAgg = {
    draft: cardDraft,
    rejected: cardRejected,
    submitted: cardSubmitted,
    noReceipt: cardMissingReceipt,
    weekTotal: cardWeekTotal,
  };

  const [itemAgg] = await db
    .select({
      unsubmitted: sql<number>`count(*) filter (where ${expenseItems.status} in ('draft','rejected') and ${expenseItems.reportId} is null and ${expenseItems.itemDate} <= ${end})`,
      rejected: sql<number>`count(*) filter (where ${expenseItems.status} = 'rejected')`,
      submitted: sql<number>`count(*) filter (where ${expenseItems.status} = 'submitted')`,
      weekTotal: sql<number>`coalesce(sum(${expenseItems.amountCents}) filter (where ${expenseItems.status} <> 'rejected' and ${expenseItems.itemDate} between ${start} and ${end}), 0)`,
    })
    .from(expenseItems)
    .where(eq(expenseItems.userId, user.id));

  const notSubmitted = Number(cardAgg.draft) + Number(cardAgg.rejected) + Number(itemAgg.unsubmitted);
  const sentBack = Number(cardAgg.rejected) + Number(itemAgg.rejected);

  const review = canReview(user)
    ? (
        await db
          .select({
            toReconcile: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'submitted')`,
            reconciled: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'reconciled')`,
            corrections: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('reconciled','approved') and ${pendingExpenses.actualAmountCents} is not null and ${pendingExpenses.actualAmountCents} <> ${pendingExpenses.amountCents})`,
            sentBack: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'rejected')`,
          })
          .from(pendingExpenses)
      )[0]
    : null;

  const payroll = canSeePayroll(user)
    ? {
        item: (
          await db
            .select({
              toReconcile: sql<number>`count(*) filter (where ${expenseItems.status} = 'submitted')`,
              sentBack: sql<number>`count(*) filter (where ${expenseItems.status} = 'rejected')`,
            })
            .from(expenseItems)
        )[0],
        report: (
          await db
            .select({
              toApprove: sql<number>`count(*) filter (where ${expenseReports.status} = 'reconciled')`,
            })
            .from(expenseReports)
        )[0],
      }
    : null;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Your week</h1>
          <Link
            href="/expenses"
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            + Log a purchase
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Drafts to finish" value={Number(cardAgg.draft)} href="/expenses" alert={Number(cardAgg.draft) > 0} />
          <Stat label="Missing a receipt" value={Number(cardAgg.noReceipt)} href="/expenses" alert={Number(cardAgg.noReceipt) > 0} />
          <Stat label="Sent back to you" value={sentBack} href="/expenses" danger={sentBack > 0} />
          <Stat label="Not submitted (due Friday)" value={notSubmitted} href="/report" alert={notSubmitted > 0} />
          <Stat label="With accounting" value={Number(cardAgg.submitted) + Number(itemAgg.submitted)} href="/report" />
        </div>
        <p className="mt-3 text-sm opacity-70">
          This week:{" "}
          <strong>{money(Number(cardAgg.weekTotal) + Number(itemAgg.weekTotal))}</strong>.{" "}
          <Link href="/report" className="underline">
            Review this week
          </Link>
          .
        </p>
      </section>

      {review && (
        <section>
          <h2 className="text-lg font-semibold">Accounting</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Card charges to reconcile" value={Number(review.toReconcile)} href="/reconcile" alert={Number(review.toReconcile) > 0} />
            <Stat label="Reconciled, awaiting approval" value={Number(review.reconciled)} href="/approvals" />
            <Stat label="Amount corrections" value={Number(review.corrections)} href="/reconcile" />
            <Stat label="Sent back to cardholders" value={Number(review.sentBack)} href="/reconcile" />
          </div>
        </section>
      )}

      {payroll && (
        <section>
          <h2 className="text-lg font-semibold">Payroll</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Reimbursement lines to reconcile" value={Number(payroll.item.toReconcile)} href="/payroll/reconcile" alert={Number(payroll.item.toReconcile) > 0} />
            <Stat label="Reports awaiting approval" value={Number(payroll.report.toApprove)} href="/payroll/approvals" alert={Number(payroll.report.toApprove) > 0} />
            <Stat label="Sent back to employees" value={Number(payroll.item.sentBack)} href="/payroll/reconcile" />
          </div>
        </section>
      )}

      {isApprover && review && (
        <section>
          <h2 className="text-lg font-semibold">To approve</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Reconciled card charges" value={Number(review.reconciled)} href="/approvals" alert={Number(review.reconciled) > 0} />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  alert,
  danger,
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "border-red-500/60 bg-red-500/10"
    : alert
      ? "border-amber-500/60 bg-amber-500/5"
      : "border-black/10 dark:border-white/15";
  return (
    <Link href={href} className={`rounded-lg border p-4 ${tone}`}>
      <div className={`text-2xl font-semibold ${danger ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </div>
      <div className="text-sm opacity-70">{label}</div>
    </Link>
  );
}
