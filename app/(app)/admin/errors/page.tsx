import { desc } from "drizzle-orm";

import { db } from "@/db";
import { errorLogs } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

import { Section } from "../_ui";
import { clearResolvedErrors, reopenError, resolveError } from "./actions";

export const dynamic = "force-dynamic";

function when(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

interface Group {
  fingerprint: string;
  count: number;
  open: boolean;
  firstSeen: Date;
  lastSeen: Date;
  message: string;
  stack: string | null;
  source: string | null;
  route: string | null;
  method: string | null;
  userEmail: string | null;
}

export default async function AdminErrorsPage() {
  await requireRole("admin");
  const rows = await db
    .select()
    .from(errorLogs)
    .orderBy(desc(errorLogs.createdAt))
    .limit(500);

  const byFingerprint = new Map<string, Group>();
  for (const r of rows) {
    const created = new Date(r.createdAt);
    const g = byFingerprint.get(r.fingerprint);
    if (!g) {
      byFingerprint.set(r.fingerprint, {
        fingerprint: r.fingerprint,
        count: 1,
        open: r.resolvedAt === null,
        firstSeen: created,
        lastSeen: created,
        message: r.message,
        stack: r.stack,
        source: r.source,
        route: r.routePath ?? r.path,
        method: r.method,
        userEmail: r.userEmail,
      });
    } else {
      g.count += 1;
      if (r.resolvedAt === null) g.open = true;
      if (created < g.firstSeen) g.firstSeen = created;
      if (created > g.lastSeen) g.lastSeen = created;
    }
  }

  const groups = [...byFingerprint.values()].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    return b.lastSeen.getTime() - a.lastSeen.getTime();
  });
  const openCount = groups.filter((g) => g.open).length;

  return (
    <Section title="Error log">
      <p className="text-sm opacity-70">
        Server errors captured across the app — render, route handlers, server actions and proxy.
        Grouped by signature; showing the last {rows.length} events.
      </p>

      {groups.length === 0 ? (
        <p className="text-sm opacity-60">No errors logged. </p>
      ) : (
        <>
          <div className="flex items-center gap-3 text-sm">
            <span>
              <strong>{openCount}</strong> open {openCount === 1 ? "issue" : "issues"} ·{" "}
              {groups.length - openCount} resolved
            </span>
            <form action={clearResolvedErrors}>
              <button className="text-xs underline opacity-70 hover:opacity-100">
                Clear resolved &amp; old (30d+)
              </button>
            </form>
          </div>

          <ul className="space-y-3">
            {groups.map((g) => (
              <li
                key={g.fingerprint}
                className={`rounded-lg border p-3 text-sm ${
                  g.open
                    ? "border-red-500/40 bg-red-500/5"
                    : "border-black/10 opacity-70 dark:border-white/15"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{g.message}</span>
                  <span className="shrink-0 text-xs opacity-60">
                    ×{g.count} · last {when(g.lastSeen)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs opacity-70">
                  {g.source ? <span className="rounded bg-black/10 px-1.5 dark:bg-white/15">{g.source}</span> : null}
                  {g.method ? <span>{g.method}</span> : null}
                  {g.route ? <span className="font-mono">{g.route}</span> : null}
                  {g.userEmail ? <span>· {g.userEmail}</span> : null}
                  <span>· first seen {when(g.firstSeen)}</span>
                </div>
                {g.stack ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs opacity-60">Stack trace</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-black/5 p-2 text-[11px] leading-snug dark:bg-white/10">
                      {g.stack}
                    </pre>
                  </details>
                ) : null}
                <div className="mt-2">
                  <form action={g.open ? resolveError : reopenError}>
                    <input type="hidden" name="fingerprint" value={g.fingerprint} />
                    <button className="text-xs underline opacity-70 hover:opacity-100">
                      {g.open ? "Mark resolved" : "Reopen"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
