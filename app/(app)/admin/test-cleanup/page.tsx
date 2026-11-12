import { desc, ne } from "drizzle-orm";

import { SubmitButton } from "@/app/components/submit-button";
import { db } from "@/db";
import { expenseReports } from "@/db/schema";
import { requireRole } from "@/lib/current-user";
import { money, shortDate } from "@/lib/format";

import { inputClass } from "../_ui";
import { deleteTestReport } from "./actions";
import { testDeleteEnabled } from "./enabled";

const ERRORS: Record<string, string> = {
  confirm: "Type DELETE exactly to confirm.",
  missing: "That report no longer exists.",
  bamboo:
    "BambooHR wouldn't delete the record(s) it holds for this report, so nothing was deleted here. Remove them in Bamboo by hand or try again.",
};

export default async function TestCleanupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; manual?: string }>;
}) {
  await requireRole("admin");
  const { error, deleted, manual } = await searchParams;

  if (!testDeleteEnabled) {
    return (
      <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        The test-delete tool is turned off.
      </p>
    );
  }

  const reports = await db.query.expenseReports.findMany({
    where: ne(expenseReports.status, "draft"),
    orderBy: [desc(expenseReports.createdAt)],
    limit: 50,
    with: { user: { columns: { name: true } }, items: { columns: { amountCents: true, bambooRowId: true } } },
  });

  return (
    <div className="max-w-3xl space-y-5 text-sm">
      <div>
        <h2 className="text-base font-semibold">Delete test reports</h2>
        <p className="mt-1 text-red-700 dark:text-red-300">
          Temporary tool. Permanently removes a reimbursement report — its lines, receipts and approval history — and
          the matching BambooHR rows and files. This can&apos;t be undone. Only use it on test data.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      ) : null}
      {deleted ? (
        <p className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3">
          ✓ Deleted the report and {deleted} line(s).
          {manual ? ` ${manual} BambooHR item(s) couldn't be removed automatically — delete them in Bamboo.` : ""}
        </p>
      ) : null}
      {reports.length === 0 ? <p className="opacity-60">No submitted reports.</p> : null}
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
        {reports.map((r) => (
          <li key={r.id} className="space-y-2 px-3 py-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="font-medium">{r.user.name}</span>{" "}
                <span className="opacity-60">
                  · week of {shortDate(r.periodStart)} · {r.status}
                </span>
              </span>
              <span className="tabular-nums">
                {r.items.length} line(s) · {money(r.items.reduce((n, i) => n + i.amountCents, 0))}
                {r.items.some((i) => i.bambooRowId) ? " · in Bamboo" : ""}
              </span>
            </div>
            <form action={deleteTestReport} className="flex flex-wrap gap-2">
              <input type="hidden" name="reportId" value={r.id} />
              <input name="confirm" placeholder="Type DELETE" autoComplete="off" className={`${inputClass} w-36`} />
              <SubmitButton
                pendingLabel="Deleting…"
                className="rounded-md border border-red-600/50 px-3 py-1.5 font-medium text-red-700 dark:text-red-300"
              >
                Delete this report
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
