import { canReview, getCurrentUser } from "@/lib/current-user";
import { buildPdf, buildWorkbook } from "@/lib/report-export";
import {
  exportFilename,
  loadSpend,
  resolvePeriod,
  summarize,
  type RangeKind,
  type SpendScope,
} from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canReview(user)) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const rangeParam = url.searchParams.get("range") ?? "month";
  const range: RangeKind = (["week", "month", "quarter"] as const).includes(rangeParam as RangeKind)
    ? (rangeParam as RangeKind)
    : "month";
  const scope: SpendScope = url.searchParams.get("scope") === "approved" ? "approved" : "turned_in";
  const period = resolvePeriod(range, url.searchParams.get("start") ?? undefined);
  const prev = resolvePeriod(range, period.prevStart);

  const lines = await loadSpend({ start: period.start, end: period.end, scope });
  const prevLines = await loadSpend({ start: prev.start, end: prev.end, scope });
  const summary = summarize(lines, prevLines);

  const body =
    format === "xlsx"
      ? await buildWorkbook(lines, summary, period)
      : await buildPdf(lines, summary, period, scope);

  return new Response(body, {
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      "Content-Disposition": `attachment; filename="${exportFilename(period, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
