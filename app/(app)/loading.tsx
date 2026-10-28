import { Spinner } from "@/app/components/spinner";

/** Shown instantly while a page loads, so a tap always gets visible feedback. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-2 text-sm opacity-70">
        <Spinner />
        Loading…
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-20 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
        ))}
      </div>
    </div>
  );
}
