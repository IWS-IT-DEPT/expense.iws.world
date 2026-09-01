import type { Instrumentation } from "next";

import { logError } from "@/lib/log-error";

/**
 * Captures every server error Next.js surfaces (RSC render, route handlers,
 * server actions, proxy) into `error_logs`, which the IT Admin dashboard reads.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  await logError({
    message,
    stack,
    digest,
    path: request.path,
    method: request.method,
    source: context.routeType,
    routePath: context.routePath,
  });
};
