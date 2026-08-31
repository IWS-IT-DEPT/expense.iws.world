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
    <button
      type="submit"
      className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
    >
      {label}
    </button>
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
    <button type="submit" className={`text-xs underline opacity-70 hover:opacity-100 ${className}`}>
      {label}
    </button>
  );
}
