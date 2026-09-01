import { db } from "@/db";
import { errorLogs } from "@/db/schema";

/**
 * Persists server-side errors to `error_logs` for the IT Admin dashboard.
 * Runtime-agnostic (no `node:crypto`) so it works from `instrumentation.ts`
 * in both the Node and Edge runtimes. Every write is best-effort — logging a
 * failure must never mask or replace the original error.
 */

export interface LoggedError {
  message: string;
  stack?: string | null;
  digest?: string | null;
  path?: string | null;
  method?: string | null;
  /** 'render' | 'route' | 'action' | 'proxy' | 'manual' */
  source?: string | null;
  routePath?: string | null;
  userEmail?: string | null;
}

/** FNV-1a — a stable, dependency-free grouping key. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Framework control-flow "errors" that aren't real failures. */
function isControlFlow(message: string, digest?: string | null): boolean {
  const d = digest ?? "";
  return (
    d.startsWith("NEXT_REDIRECT") ||
    d.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
    message === "NEXT_NOT_FOUND" ||
    message === "NEXT_REDIRECT"
  );
}

export async function logError(e: LoggedError): Promise<void> {
  if (isControlFlow(e.message, e.digest)) return;
  try {
    await db.insert(errorLogs).values({
      fingerprint: hash(`${e.message}\n${e.routePath ?? e.path ?? ""}`),
      message: e.message.slice(0, 4000),
      stack: e.stack ? e.stack.slice(0, 8000) : null,
      digest: e.digest ?? null,
      path: e.path ?? null,
      method: e.method ?? null,
      source: e.source ?? "manual",
      routePath: e.routePath ?? null,
      userEmail: e.userEmail ?? null,
    });
  } catch (err) {
    console.error("[log-error] could not persist error:", err);
  }
}
