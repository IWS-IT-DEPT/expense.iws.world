"use client";

import { useRouter } from "next/navigation";

import { ConfirmAction } from "@/app/components/confirm-action";

import { voidCardExpense, voidExpenseItem } from "./actions";

/** Delete a draft / discard a sent-back expense — behind a two-step confirm. */
export function DiscardExpense({
  id,
  kind,
  status,
}: {
  id: string;
  kind: "card" | "item";
  status: "draft" | "rejected";
}) {
  const router = useRouter();
  const draft = status === "draft";

  return (
    <ConfirmAction
      label={draft ? "Delete this expense" : "Discard this expense"}
      confirmLabel={draft ? "Yes, delete it" : "Yes, discard it"}
      question={
        draft
          ? "Delete this expense? It and its receipts are removed for good."
          : "Discard this sent-back expense? It's voided and won't be submitted. This can't be undone."
      }
      run={async () => {
        const fd = new FormData();
        fd.set("id", id);
        await (kind === "card" ? voidCardExpense : voidExpenseItem)(fd);
        router.push("/expenses");
        router.refresh();
      }}
    />
  );
}
