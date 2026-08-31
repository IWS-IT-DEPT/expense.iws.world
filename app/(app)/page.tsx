import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import { canReview, isAdmin, requireUser } from "@/lib/current-user";
import { money, weekBounds } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const { start, end } = weekBounds(new Date());
  const isApprover = user.role === "approver" || isAdmin(user);

  // ---- cardholder: my card lines + my expense items -----------------------
  const [cardAgg] = await db
    .select({
      draft: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'draft')`,
      rejected: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'rejected')`,
      submitted: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'submitted')`,
      toSubmit: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('draft','rejected') and ${pendingExpenses.reportId} is null and ${pendingExpenses.purchaseDate} <= ${end})`,
      weekTotal: sql<number>`coalesce(sum(coalesce(${pendingExpenses.actualAmountCents}, ${pendingExpenses.amountCents})) filter (where ${pendingExpenses.status} <> 'cancelled' and ${pendingExpenses.purchaseDate} between ${start} and ${end}), 0)`,
      noReceipt: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('draft','rejected') and not exists (select 1 from receipts r where r.pending_expense_id = ${pendingExpenses.id}))`,
    })
    .from(pendingExpenses)
    .where(eq(pendingExpenses.userId, user.id));

  const [itemAgg] = await db
    .select({
      toSubmit: sql<number>`count(*) filter (where ${expenseItems.status} in ('draft','rejected') and ${expenseItems.reportId} is null and ${expenseItems.itemDate} <= ${end})`,
      submitted: sql<number>`count(*) filter (where ${expenseItems.status} = 'submitted')`,
      rejected: sql<number>`count(*) filter (where ${expenseItems.status} = 'rejected')`,
      weekTotal: sql<number>`coalesce(sum(${expenseItems.amountCents}) filter (where ${expenseItems.status} <> 'cancelled' and ${expenseItems.itemDate} between ${start} and ${end}), 0)`,
    })
    .from(expenseItems)
    .where(eq(expenseItems.userId, user.id));

  const filedThisWeek = await db.query.expenseReports.findFirst({
    where: and(eq(expenseReports.userId, user.id), eq(expenseReports.periodStart, start)),
    columns: { status: true },
  });
  const alreadyFiled = ["submitted", "reconciled", "approved"].includes(filedThisWeek?.status ?? "");

  // ---- accounting --------------------------------------------------------
  const review = canReview(user)
    ? (
        await db
          .select({
            linesToReconcile: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'submitted')`,
            discrepancies: sql<number>`count(*) filter (where ${pendingExpenses.status} in ('reconciled','approved') and (${pendingExpenses.actualAmountCents} is not null and ${pendingExpenses.actualAmountCents} <> ${pendingExpenses.amountCents}))`,
            sentBack: sql<number>`count(*) filter (where ${pendingExpenses.status} = 'rejected')`,
          })
          .from(pendingExpenses)
      )[0]
    : null;

  const reportAgg = canReview(user)
    ? (
        await db
          .select({
            toReconcile: sql<number>`count(*) filter (where ${expenseReports.status} = 'submitted')`,
            toApprove: sql<number>`count(*) filter (where ${expenseReports.status} = 'reconciled')`,
            approvedThisWeek: sql<number>`count(*) filter (where ${expenseReports.status} = 'approved' and ${expenseReports.approvedAt} between ${start} and ${end})`,
          })
          .from(expenseReports)
      )[0]
    : null;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Your week</h1>
          <Link href="/expenses/new" className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black">
            + Log a purchase
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Drafts to finish" value={Number(cardAgg.draft)} href="/expenses" alert={Number(cardAgg.draft) > 0} />
          <Stat label="Missing a receipt" value={Number(cardAgg.noReceipt)} href="/expenses" alert={Number(cardAgg.noReceipt) > 0} />
          <Stat label="Sent back to you" value={Number(cardAgg.rejected) + Number(itemAgg.rejected)} href="/expenses" alert={Number(cardAgg.rejected) + Number(itemAgg.rejected) > 0} />
          <Stat label="Not submitted this week" value={Number(cardAgg.toSubmit) + Number(itemAgg.toSubmit)} href="/report" alert={!alreadyFiled && Number(cardAgg.toSubmit) + Number(itemAgg.toSubmit) > 0} />
          <Stat label="Submitted, awaiting accounting" value={Number(cardAgg.submitted) + Number(itemAgg.submitted)} href="/report" />
        </div>
        <p className="mt-3 text-sm opacity-70">
          Charges dated {start} – {end}:{" "}
          <strong>{money(Number(cardAgg.weekTotal) + Number(itemAgg.weekTotal))}</strong>.{" "}
          <Link href="/report" className="underline">
            {alreadyFiled ? "This week's report is filed" : "Review & submit this week"}
          </Link>
          .
        </p>
      </section>

      {review && reportAgg && (
        <section>
          <h2 className="text-lg font-semibold">Accounting</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Card lines to reconcile" value={Number(review.linesToReconcile)} href="/reconcile" alert={Number(review.linesToReconcile) > 0} />
            <Stat label="Reports to reconcile" value={Number(reportAgg.toReconcile)} href="/reconcile" />
            <Stat label="Reconciled, awaiting approval" value={Number(reportAgg.toApprove)} href="/approvals" />
            <Stat label="Amount corrections" value={Number(review.discrepancies)} href="/reconcile" />
            <Stat label="Sent back to cardholders" value={Number(review.sentBack)} href="/reconcile" />
          </div>
        </section>
      )}

      {isApprover && reportAgg && (
        <section>
          <h2 className="text-lg font-semibold">Approvals</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Reports to approve" value={Number(reportAgg.toApprove)} href="/approvals" alert={Number(reportAgg.toApprove) > 0} />
            <Stat label="Approved this week" value={Number(reportAgg.approvedThisWeek)} href="/approvals" />
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
