import { asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { EntityBadge } from "../../components/entity-badge";
import { approveClean, approveOne, rejectOne, resolveFlag } from "./actions";

function getReviewRows() {
  return db.query.transactions.findMany({
    where: inArray(transactions.status, ["submitted", "in_review"]),
    orderBy: [asc(transactions.txnDate)],
    with: {
      assignedUser: true,
      cardAccount: true,
      allocations: { with: { entity: true, location: true, category: true, unit: true, job: true } },
      flags: true,
      receipts: true,
    },
  });
}

type ReviewRow = Awaited<ReturnType<typeof getReviewRows>>[number];

export default async function ReviewPage() {
  await requireRole("accounting", "approver", "admin");

  const rows = await getReviewRows();

  const openFlagCount = (t: (typeof rows)[number]) =>
    t.flags.filter((f) => !f.resolved && f.severity !== "info").length;
  const clean = rows.filter((t) => openFlagCount(t) === 0);
  const flagged = rows.filter((t) => openFlagCount(t) > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Review Queue</h1>
        <form action={approveClean}>
          <button
            type="submit"
            disabled={clean.length === 0}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Approve {clean.length} clean
          </button>
        </form>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Needs a look ({flagged.length})
        </h2>
        <div className="space-y-3">
          {flagged.map((t) => (
            <div key={t.id} className="rounded-lg border border-amber-500/50 p-4">
              <Row t={t} />
              <ul className="mt-2 space-y-1 text-sm">
                {t.flags
                  .filter((f) => !f.resolved)
                  .map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3">
                      <span className={f.severity === "block" ? "text-red-600" : "text-amber-600"}>
                        • {f.detail}
                      </span>
                      <form action={resolveFlag}>
                        <input type="hidden" name="flagId" value={f.id} />
                        <button className="text-xs underline opacity-70">dismiss</button>
                      </form>
                    </li>
                  ))}
              </ul>
              <Actions id={t.id} />
            </div>
          ))}
          {flagged.length === 0 && <p className="text-sm opacity-60">Nothing flagged.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">
          Clean ({clean.length})
        </h2>
        <div className="space-y-2">
          {clean.map((t) => (
            <div key={t.id} className="rounded-lg border border-black/10 p-3 dark:border-white/15">
              <Row t={t} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ t }: { t: ReviewRow }) {
  const a = t.allocations[0];
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
      <span className="font-medium">{t.merchantRaw}</span>
      <span>{money(t.amountCents)}</span>
      <span className="opacity-60">
        {shortDate(t.txnDate)} · {t.assignedUser?.name ?? "unassigned"} · {t.cardAccount.name}
      </span>
      <span className="flex w-full flex-wrap items-center gap-1 opacity-70">
        {a ? (
          <>
            <EntityBadge code={a.entity.code} color={a.entity.brandColor} />
            {a.location.name}
            {a.unit ? ` · ${a.unit.unitNumber}` : ""}
            {a.job ? ` · Job ${a.job.jobNumber}` : ""} · {a.category.name} — {a.businessPurpose}
          </>
        ) : (
          "not coded"
        )}
      </span>
    </div>
  );
}

function Actions({ id }: { id: string }) {
  return (
    <div className="mt-3 flex gap-2">
      <form action={approveOne}>
        <input type="hidden" name="transactionId" value={id} />
        <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
          Approve anyway
        </button>
      </form>
      <form action={rejectOne} className="flex gap-1">
        <input type="hidden" name="transactionId" value={id} />
        <input
          name="reason"
          placeholder="reason"
          className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20"
        />
        <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white">
          Send back
        </button>
      </form>
    </div>
  );
}
