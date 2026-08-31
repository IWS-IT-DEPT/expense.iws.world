import Link from "next/link";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { exceptionFlags, transactions } from "@/db/schema";
import { canReview, requireUser } from "@/lib/current-user";
import { money, weekBounds } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const { start, end } = weekBounds(new Date());

  const [mine] = await db
    .select({
      uncoded: sql<number>`count(*) filter (where ${transactions.status} = 'uncoded')`,
      coded: sql<number>`count(*) filter (where ${transactions.status} = 'coded')`,
      rejected: sql<number>`count(*) filter (where ${transactions.status} = 'rejected')`,
      weekTotal: sql<number>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.txnDate} between ${start} and ${end}), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.assignedUserId, user.id));

  const review = canReview(user)
    ? (
        await db
          .select({
            inReview: sql<number>`count(*) filter (where ${transactions.status} in ('submitted','in_review'))`,
            unassigned: sql<number>`count(*) filter (where ${transactions.status} = 'unassigned')`,
          })
          .from(transactions)
      )[0]
    : null;

  const openFlags = canReview(user)
    ? (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(exceptionFlags)
          .where(eq(exceptionFlags.resolved, false))
      )[0].n
    : 0;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Your week</h1>
          <Link
            href="/receipts"
            className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            + Log a purchase
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Needs coding" value={mine.uncoded} href="/transactions?status=uncoded" alert={mine.uncoded > 0} />
          <Stat label="Coded, not submitted" value={mine.coded} href="/transactions?status=coded" />
          <Stat label="Sent back to you" value={mine.rejected} href="/transactions?status=rejected" alert={mine.rejected > 0} />
        </div>
        <p className="mt-3 text-sm opacity-70">
          Charges dated {start} – {end}: <strong>{money(mine.weekTotal)}</strong>.{" "}
          <Link href="/report" className="underline">
            Open this week&apos;s report
          </Link>
          .
        </p>
      </section>

      {review && (
        <section>
          <h2 className="text-lg font-semibold">Review</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Awaiting review" value={review.inReview} href="/review" />
            <Stat label="Open exception flags" value={openFlags} href="/review?filter=flagged" alert={openFlags > 0} />
            <Stat label="Unassigned charges" value={review.unassigned} href="/review?filter=unassigned" alert={review.unassigned > 0} />
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
