import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { transactions, type txnStatus } from "@/db/schema";
import { requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

type Status = (typeof txnStatus.enumValues)[number];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const filter = (txnStatusValues.includes(status as Status) ? status : undefined) as
    | Status
    | undefined;

  const rows = await db.query.transactions.findMany({
    where: filter
      ? and(eq(transactions.assignedUserId, user.id), eq(transactions.status, filter))
      : eq(transactions.assignedUserId, user.id),
    orderBy: [desc(transactions.txnDate)],
    with: { cardAccount: true, allocations: { with: { category: true, entity: true } } },
    limit: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">My Transactions</h1>
        <div className="flex gap-2 text-sm">
          <FilterLink label="All" href="/transactions" active={!filter} />
          <FilterLink label="Needs coding" href="/transactions?status=uncoded" active={filter === "uncoded"} />
          <FilterLink label="Coded" href="/transactions?status=coded" active={filter === "coded"} />
          <FilterLink label="Sent back" href="/transactions?status=rejected" active={filter === "rejected"} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm opacity-70">Nothing here. Card charges appear after accounting imports the statement.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2">Date</th>
              <th>Merchant</th>
              <th>Card</th>
              <th className="text-right">Amount</th>
              <th>Coding</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-black/10 dark:border-white/10">
                <td className="py-2">{shortDate(t.txnDate)}</td>
                <td>{t.merchantRaw}</td>
                <td className="opacity-60">{t.cardAccount.name}</td>
                <td className="text-right">{money(t.amountCents)}</td>
                <td className="opacity-70">
                  {t.allocations.length === 0
                    ? "—"
                    : t.allocations
                        .map((a) => `${a.entity.code} / ${a.category.name}`)
                        .join(", ")}
                </td>
                <td className="text-right">
                  <Link href={`/transactions/${t.id}`} className="underline">
                    {t.allocations.length === 0 ? "Code" : "Edit"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const txnStatusValues: string[] = [
  "unassigned",
  "uncoded",
  "coded",
  "submitted",
  "in_review",
  "approved",
  "exported",
  "rejected",
];

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 ${
        active ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/15 dark:border-white/20"
      }`}
    >
      {label}
    </Link>
  );
}
