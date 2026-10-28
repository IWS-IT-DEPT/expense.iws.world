"use client";

import { useRouter } from "next/navigation";

import { ConfirmAction } from "@/app/components/confirm-action";
import { submitAllReadyCardExpenses } from "@/app/(app)/expenses/actions";

/** Send every finished card purchase to accounting — after a confirm. */
export function SubmitReadyButton({ count }: { count: number }) {
  const router = useRouter();
  return (
    <ConfirmAction
      tone="primary"
      label={`Submit ${count} ready ${count === 1 ? "purchase" : "purchases"}`}
      confirmLabel={`Yes, submit ${count}`}
      question={
        <>
          Send <strong>{count}</strong> finished card {count === 1 ? "purchase" : "purchases"} to accounting?
          They can&apos;t be edited after this unless accounting sends them back.
        </>
      }
      run={async () => {
        await submitAllReadyCardExpenses();
        router.refresh();
      }}
    />
  );
}
