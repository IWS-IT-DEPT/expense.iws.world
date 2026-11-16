import Link from "next/link";

import type { MileageFlag } from "@/lib/mileage-flags";
import { flagText } from "@/lib/mileage-flags";

/** Payroll-side only. Callers must never render this for the employee who owns the line. */
export function MileageFlagChips({ flags, detailed = false }: { flags?: MileageFlag[]; detailed?: boolean }) {
  if (!flags || flags.length === 0) return null;
  if (detailed) {
    return (
      <ul className="space-y-1">
        {flags.map((f, i) => (
          <li key={i} className="text-sm text-amber-800 dark:text-amber-300">
            ⚑ {flagText(f)}
            {f.kind === "overlap" ? (
              <>
                {" "}
                <Link href={`/expenses/${f.otherId}`} className="underline">
                  open it
                </Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
  const overlap = flags.filter((f) => f.kind === "overlap").length;
  const round = flags.some((f) => f.kind === "round");
  return (
    <span className="inline-flex flex-wrap gap-1">
      {overlap > 0 ? (
        <span
          title={flags.filter((f) => f.kind === "overlap").map(flagText).join("\n")}
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          ⚑ overlaps {overlap === 1 ? "another trip" : `${overlap} trips`}
        </span>
      ) : null}
      {round ? (
        <span
          title={flagText({ kind: "round" })}
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300"
        >
          ⚑ round readings
        </span>
      ) : null}
    </span>
  );
}
