"use client";

import { useState } from "react";

import { Modal } from "@/app/components/modal";

import { PendingExpenseForm, type PendingExpenseFormProps } from "./pending-expense-form";

/** "Add to Receipt Bank" — opens the pre-coding form in a modal. */
export function AddToBankButton(props: Omit<PendingExpenseFormProps, "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Log a Purchase
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log a purchase">
        <PendingExpenseForm {...props} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/** Edit an existing bank entry. */
export function EditBankEntryButton(props: PendingExpenseFormProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs underline opacity-70 hover:opacity-100"
      >
        Edit
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit bank entry">
        <PendingExpenseForm {...props} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
