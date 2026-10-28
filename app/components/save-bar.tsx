import { SubmitButton } from "@/app/components/submit-button";

/**
 * The "you have unsaved changes" bar. Forms render it only once something has
 * actually changed, so there is never a Save button to hit by accident.
 */
export function SaveBar({ pending, label = "Save changes" }: { pending?: boolean; label?: string }) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-black/15 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center dark:border-white/20 dark:bg-neutral-900/95">
      <span className="text-sm opacity-70">You have unsaved changes.</span>
      <SubmitButton
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-black px-5 text-sm font-semibold text-white disabled:opacity-50 sm:ml-auto dark:bg-white dark:text-black"
      >
        {pending ? "Saving…" : label}
      </SubmitButton>
    </div>
  );
}
