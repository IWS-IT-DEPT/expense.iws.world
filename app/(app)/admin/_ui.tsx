import Link from "next/link";
import { SubmitButton } from "@/app/components/submit-button";
import type { ReactNode } from "react";

export const inputClass =
  "rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left opacity-60">
          <tr>
            {head.map((h) => (
              <th key={h} className="pb-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-t border-black/10 align-top dark:border-white/10">{children}</tr>;
}

export function SaveButton({ label = "Save" }: { label?: string }) {
  return (
    <SubmitButton
      type="submit"
      className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
    >
      {label}
    </SubmitButton>
  );
}

/**
 * Delete control for a dimension row. `used` rows can't be hard-deleted (they're
 * referenced by expense history or QBO mappings) — the caller deactivates
 * instead via the row's `active` checkbox.
 */
export function DeleteCell({
  used,
  action,
}: {
  used: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  if (used) {
    return (
      <span
        className="text-xs opacity-40"
        title="Referenced by expenses or QBO mappings — uncheck ‘active’ to retire it instead"
      >
        in use
      </span>
    );
  }
  return (
    <SubmitButton
      type="submit"
      formAction={action}
      formNoValidate
      className="text-xs text-red-600 underline opacity-80 hover:opacity-100"
    >
      Delete
    </SubmitButton>
  );
}

export function LinkButton({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <SubmitButton type="submit" className={`text-xs underline opacity-70 hover:opacity-100 ${className}`}>
      {label}
    </SubmitButton>
  );
}

/* ---- shared list / detail scaffolding (Entities-style settings pages) ---- */

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm underline opacity-70">
      ← {label}
    </Link>
  );
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm">{error}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs opacity-60">{hint}</span> : null}
    </label>
  );
}

export function ListHeader({
  title,
  count,
  blurb,
  addHref,
  addLabel,
}: {
  title: string;
  count: number;
  blurb: string;
  addHref: string;
  addLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">
          {title} ({count})
        </h2>
        <p className="text-xs opacity-60">{blurb}</p>
      </div>
      <Link
        href={addHref}
        className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        {addLabel}
      </Link>
    </div>
  );
}

export function RowList({ children, empty }: { children: ReactNode[]; empty: string }) {
  return (
    <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
      {children}
      {children.length === 0 ? <li className="px-4 py-6 text-sm opacity-60">{empty}</li> : null}
    </ul>
  );
}

export function RowLink({
  href,
  off,
  children,
}: {
  href: string;
  off?: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
      >
        {children}
        <span className="ml-auto flex items-center gap-3 text-xs opacity-60">
          {off ? <span className="rounded bg-black/10 px-1.5 py-0.5 dark:bg-white/15">turned off</span> : null}
          <span aria-hidden>›</span>
        </span>
      </Link>
    </li>
  );
}

/** "Delete" block: lists what blocks it, or offers the typed-confirmation form. */
export function DeleteSection({
  what,
  blockers,
  children,
}: {
  what: string;
  blockers: { label: string; count: number }[];
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-black/10 pt-6 dark:border-white/15">
      <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Delete {what}</h3>
      {blockers.length > 0 ? (
        <div className="space-y-2 text-sm">
          <p>This {what} can&apos;t be deleted because it is still used by:</p>
          <ul className="list-disc pl-5">
            {blockers.map((b) => (
              <li key={b.label}>
                {b.count} {b.label}
              </li>
            ))}
          </ul>
          <p className="opacity-70">
            To stop using it, untick <strong>Active</strong> above and save — it leaves the dropdowns and
            keeps its history.
          </p>
        </div>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer text-red-700 underline dark:text-red-400">Delete this {what}…</summary>
          <div className="mt-3">{children}</div>
        </details>
      )}
    </section>
  );
}
