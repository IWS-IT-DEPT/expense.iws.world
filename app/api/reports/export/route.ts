import { canReview, canSeePayroll, getCurrentUser } from "@/lib/current-user";
import { buildPdf, buildWorkbook } from "@/lib/report-export";
import {
  exportFilename,
  loadSpend,
  resolvePeriod,
  summarize,
  type RangeKind,
  type SpendScope,
  type SpendView,
} from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.active) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const view: SpendView = url.searchParams.get("view") === "reimbursement" ? "reimbursement" : "card";

  // Card spend → accounting/approver/admin. Reimbursements → payroll/admin.
  const allowed = view === "reimbursement" ? canSeePayroll(user) : canReview(user);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const rangeParam = url.searchParams.get("range") ?? "month";
  const range: RangeKind = (["week", "month", "quarter", "year", "all", "custom"] as const).includes(rangeParam as RangeKind)
    ? (rangeParam as RangeKind)
    : "month";
  const scope: SpendScope = url.searchParams.get("scope") === "approved" ? "approved" : "turned_in";
  const period = resolvePeriod(range, url.searchParams.get("start") ?? undefined, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  const only = view === "reimbursement" ? "reimbursement" : "card";
  const lines = await loadSpend({ start: period.start, end: period.end, scope, only });
  const prevLines = period.prevRange ? await loadSpend({ ...period.prevRange, scope, only }) : [];
  const summary = summarize(lines, prevLines);

  const body =
    format === "xlsx"
      ? await buildWorkbook(lines, summary, period, view, (process.env.APP_URL || url.origin).replace(/\/$/, ""))
      : await buildPdf(lines, summary, period, scope, view);

  return new Response(body, {
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFilename(period, format, view)}"`,
      "Cache-Control": "no-store",
    },
  });
}
