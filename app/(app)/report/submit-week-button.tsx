"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmAction } from "@/app/components/confirm-action";

import { submitWeek } from "./actions";

/** Send this week's reimbursements to Payroll — behind a confirm step. */
export function SubmitWeekButton({
  periodStart,
  periodEnd,
  disabled,
  count,
}: {
  periodStart: string;
  periodEnd: string;
  disabled: boolean;
  count: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;
  if (disabled) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">Finish the flagged items above first — tap one to fix it.</p>;
  }

  return (
    <div className="space-y-2">
      <ConfirmAction
        tone="primary"
        label={`Submit ${count} reimbursement${count === 1 ? "" : "s"} to Payroll`}
        confirmLabel="Yes, submit to Payroll"
        question={
          <>
            Send <strong>{count}</strong> reimbursement{count === 1 ? "" : "s"} to Payroll as this week&apos;s
            report? They can&apos;t be edited after this unless Payroll sends them back.
          </>
        }
        run={async () => {
          const fd = new FormData();
          fd.set("periodStart", periodStart);
          fd.set("periodEnd", periodEnd);
          const r = await submitWeek({}, fd);
          if (r.error) setError(r.error);
          else {
            setError(null);
            router.refresh();
          }
        }}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
