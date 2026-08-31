import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { transactions, type txnStatus } from "@/db/schema";
import { ReceiptUploadButton } from "@/app/components/receipt-upload-button";
import { requireUser } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";

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
    with: {
      cardAccount: true,
      allocations: { with: { category: true, entity: true } },
      receipts: { columns: { id: true } },
    },
    limit: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">My Transactions</h1>
        <div className="flex gap-2 text-sm">
          <FilterLink label="All" href="/transactions" active={!filter} />
          <FilterLink label="Needs coding" href="/transactions?status=uncoded" active={filter === "uncoded"} />
          <FilterLink label="Coded" href="/transactions?status=coded" active={filter === "coded"} />
          <FilterLink label="Sent back" href="/transactions?status=rejected" active={filter === "rejected"} />
        </div>
        <Link
          href="/receipts"
          className="ml-auto rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          + Log a purchase
        </Link>
      </div>

      <p className="text-sm opacity-60">
        Card charges land here automatically when accounting imports the statement — you don&apos;t
        add them by hand. To attach a receipt and coding <em>before</em> the charge posts, use{" "}
        <Link href="/receipts" className="underline">
          Log a Purchase
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <p className="text-sm opacity-70">
          Nothing here yet. Charges show up after accounting imports the statement.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left opacity-60">
            <tr>
              <th className="py-2">Date</th>
              <th>Merchant</th>
              <th>Card</th>
              <th className="text-right">Amount</th>
              <th>Coding</th>
              <th>Receipt</th>
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
                  {t.allocations.length === 0 ? (
                    "—"
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {t.allocations.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1">
                          <EntityBadge code={a.entity.code} color={a.entity.brandColor} />
                          {a.category.name}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td>
                  {t.receipts.length > 0 ? (
                    <span className="opacity-70" title={`${t.receipts.length} receipt(s)`}>
                      📎 {t.receipts.length}
                    </span>
                  ) : (
                    <ReceiptUploadButton purpose="txn" targetId={t.id} label="Add" compact />
                  )}
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
