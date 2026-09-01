import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { pendingExpenses } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";
import { cardLabel } from "../expenses/coding-options";
import { ReconcileLine } from "./reconcile-line";

type Rec = { id: string; contentType: string };

function ReceiptStrip({ receipts }: { receipts: Rec[] }) {
  if (receipts.length === 0) {
    return <span className="text-xs text-amber-600 dark:text-amber-400">no receipt</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {receipts.map((r) => (
        <a key={r.id} href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">
          {r.contentType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/receipts/${r.id}`}
              alt="receipt"
              className="h-16 w-12 rounded border border-black/10 object-cover dark:border-white/15"
            />
          ) : (
            <span className="flex h-16 w-12 items-center justify-center rounded border border-black/10 text-xs opacity-70 dark:border-white/15">
              PDF
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  await requireRole("accounting", "approver", "admin");
  const { sort } = await searchParams;
  const newestFirst = sort === "desc";
  const dir = newestFirst ? desc : asc;

  const lines = await db.query.pendingExpenses.findMany({
    where: eq(pendingExpenses.status, "submitted"),
    orderBy: [dir(pendingExpenses.purchaseDate), dir(pendingExpenses.createdAt)],
    with: {
      user: { columns: { name: true } },
      card: true,
      entity: true,
      location: true,
      category: true,
      receipts: { columns: { id: true, contentType: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Reconcile</h1>
          <p className="text-sm opacity-70">
            Submitted card charges in statement order. Confirm each against the statement — correcting
            the posted amount or date if it differs — or send it back. Mileage and out-of-pocket
            reimbursements are handled by payroll.
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          <Link
            href="/reconcile?sort=asc"
            className={
              newestFirst
                ? "rounded border border-black/15 px-2 py-0.5 dark:border-white/20"
                : "rounded bg-black px-2 py-0.5 text-white dark:bg-white dark:text-black"
            }
          >
            Oldest first
          </Link>
          <Link
            href="/reconcile?sort=desc"
            className={
              newestFirst
                ? "rounded bg-black px-2 py-0.5 text-white dark:bg-white dark:text-black"
                : "rounded border border-black/15 px-2 py-0.5 dark:border-white/20"
            }
          >
            Newest first
          </Link>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm opacity-60">Nothing to reconcile right now.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{shortDate(l.purchaseDate)}</span>
                <span className="font-medium">{l.merchant}</span>
                <span>{money(l.amountCents)}</span>
                <span className="opacity-70">{l.user.name}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 opacity-80">
                <span className="opacity-70">
                  {l.card ? cardLabel(l.card) : "no card"}
                </span>
                {" · "}
                {l.entity ? <EntityBadge code={l.entity.code} color={l.entity.brandColor} /> : null}
                {l.location?.name}
                {l.category ? ` · ${l.category.name}` : ""}
                {l.businessPurpose ? ` — ${l.businessPurpose}` : ""}
              </div>
              <div className="mt-2">
                <ReceiptStrip receipts={l.receipts} />
              </div>
              <ReconcileLine
                lineId={l.id}
                amountLabel={(l.amountCents / 100).toFixed(2)}
                dateLabel={l.purchaseDate}
              />
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
