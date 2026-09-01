import Link from "next/link";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { canReview, isAdmin, requireUser } from "@/lib/current-user";
import { money, weekBounds } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const { start, end } = weekBounds(new Date());
  const isApprover = user.role === "approver" || isAdmin(user);

  const [cardAgg] = await db
    .select({
      draft: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'draft')`,
      rejected: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'rejected')`,
      submitted: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('submitted','reconciled'))`,
      noReceipt: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('draft','rejected') and not exists (select 1 from receipts r where r.pending_expense_id = ${pendingExpenses.id}))`,
      weekTotal: sql<number>`coalesce(sum(coalesce(${pendingExpenses.actualAmountCents}, ${pendingExpenses.amountCents})) filter (where ${pendingExpenses.status} <> 'cancelled' and ${pendingExpenses.purchaseDate} between ${start} and ${end}), 0)`,
    })
    .from(pendingExpenses)
    .where(eq(pendingExpenses.userId, user.id));

  const [itemAgg] = await db
    .select({
      unsubmitted: sql<number>`count(*) filter (where ${expenseItems.status} in ('draft','rejected') and ${expenseItems.reportId} is null and ${expenseItems.itemDate} <= ${end})`,
      submitted: sql<number>`count(*) filter (where ${expenseItems.status} = 'submitted')`,
      weekTotal: sql<number>`coalesce(sum(${expenseItems.amountCents}) filter (where ${expenseItems.status} <> 'rejected' and ${expenseItems.itemDate} between ${start} and ${end}), 0)`,
    })
    .from(expenseItems)
    .where(eq(expenseItems.userId, user.id));

  const notSubmitted = Number(cardAgg.draft) + Number(cardAgg.rejected) + Number(itemAgg.unsubmitted);

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

  const reimb = canReview(user)
    ? (
        await db
          .select({
            toApprove: sql<number>`count(*) filter (where ${expenseReports.status} = 'submitted')`,
          })
          .from(expenseReports)
      )[0]
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
          <Stat label="Sent back to you" value={Number(cardAgg.rejected)} href="/expenses" alert={Number(cardAgg.rejected) > 0} />
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

      {review && reimb && (
        <section>
          <h2 className="text-lg font-semibold">Accounting</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Card charges to reconcile" value={Number(review.toReconcile)} href="/reconcile" alert={Number(review.toReconcile) > 0} />
            <Stat label="Reconciled, awaiting approval" value={Number(review.reconciled)} href="/approvals" />
            <Stat label="Reimbursement reports to approve" value={Number(reimb.toApprove)} href="/approvals" />
            <Stat label="Amount corrections" value={Number(review.corrections)} href="/reconcile" />
            <Stat label="Sent back to cardholders" value={Number(review.sentBack)} href="/reconcile" />
          </div>
        </section>
      )}

      {isApprover && review && reimb && (
        <section>
          <h2 className="text-lg font-semibold">To approve</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Reconciled card charges" value={Number(review.reconciled)} href="/approvals" alert={Number(review.reconciled) > 0} />
            <Stat label="Reimbursement reports" value={Number(reimb.toApprove)} href="/approvals" alert={Number(reimb.toApprove) > 0} />
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
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 ${
        alert ? "border-amber-500/60 bg-amber-500/5" : "border-black/10 dark:border-white/15"
      }`}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm opacity-70">{label}</div>
    </Link>
  );
}
