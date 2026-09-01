/**
 * Renders the spend datasets from `lib/reports.ts` into a multi-sheet Excel
 * workbook or a paginated PDF. Node-only (used by `app/api/reports/export`).
 */
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import { money } from "@/lib/format";
import {
  buildDataset,
  groupTotals,
  type DatasetKind,
  type Period,
  type SpendLine,
  type SpendScope,
  type SpendView,
  type Summary,
} from "@/lib/reports";

const CARD_SHEETS: DatasetKind[] = [
  "summary",
  "transactions",
  "entity",
  "category",
  "cardholder",
  "merchant",
];
// Reimbursements never have a merchant — drop that sheet for the payroll view.
const REIMBURSEMENT_SHEETS: DatasetKind[] = CARD_SHEETS.filter((s) => s !== "merchant");

/* --------------------------------------------------------------- xlsx ------ */

export async function buildWorkbook(
  lines: SpendLine[],
  summary: Summary,
  period: Period,
  view: SpendView = "card",
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "IWS Expense";
  wb.created = new Date();

  for (const kind of view === "reimbursement" ? REIMBURSEMENT_SHEETS : CARD_SHEETS) {
    const ds = buildDataset(kind, lines, summary, period, view);
    const ws = wb.addWorksheet(ds.name);
    ws.addRow(ds.columns);
    ws.getRow(1).font = { bold: true };
    for (const r of ds.rows) ws.addRow(r);
    ds.columns.forEach((label, i) => {
      const col = ws.getColumn(i + 1);
      const widest = Math.max(label.length, ...ds.rows.map((r) => String(r[i] ?? "").length));
      col.width = Math.min(52, Math.max(12, widest + 2));
      if (ds.moneyColumns.includes(i)) col.numFmt = '"$"#,##0.00';
    });
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/* ---------------------------------------------------------------- pdf ------ */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;

function safe(s: string): string {
  return s.replace(/→/g, "->").replace(/[^\x20-\x7E]/g, "?");
}
function hexToRgb(hex: string | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return rgb(0.4, 0.4, 0.4);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function fit(s: string, font: PDFFont, size: number, maxWidth: number): string {
  const out = safe(s);
  if (font.widthOfTextAtSize(out, size) <= maxWidth) return out;
  let clipped = out;
  while (clipped.length > 1 && font.widthOfTextAtSize(`${clipped}..`, size) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}..`;
}

export async function buildPdf(
  lines: SpendLine[],
  summary: Summary,
  period: Period,
  scope: SpendScope,
  view: SpendView = "card",
): Promise<ArrayBuffer> {
  const reimb = view === "reimbursement";
  const personLabel = reimb ? "Employee" : "Cardholder";
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const write = (
    s: string,
    x: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(safe(s), {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      return true;
    }
    return false;
  };

  write(reimb ? "IWS Expense - Reimbursement Report" : "IWS Expense - Spend Report", MARGIN, {
    size: 16,
    bold: true,
  });
  y -= 20;
  write(`${period.label}  -  ${scope === "approved" ? "Approved only" : "All submitted"}`, MARGIN, {
    size: 10,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 13;
  write(`Generated ${new Date().toLocaleString("en-US")}`, MARGIN, {
    size: 9,
    color: rgb(0.55, 0.55, 0.55),
  });
  y -= 26;

  const deltaRow: [string, string] = [
    "vs previous period",
    summary.deltaPct == null
      ? "n/a"
      : `${summary.deltaPct >= 0 ? "+" : ""}${summary.deltaPct.toFixed(1)}%`,
  ];
  const sumRows: [string, string][] = reimb
    ? [
        ["Total reimbursements", money(summary.reimbursement)],
        ["Out of pocket", money(summary.reimbursement - summary.mileageDollars)],
        ["Mileage", `${money(summary.mileageDollars)}  (${summary.miles.toLocaleString()} mi)`],
        ["Line items", String(summary.txnCount)],
        ["Average item", money(summary.avg)],
        deltaRow,
      ]
    : [
        ["Card spend", money(summary.card)],
        ["Transactions", String(summary.txnCount)],
        ["Average transaction", money(summary.avg)],
        deltaRow,
      ];
  for (const [k, v] of sumRows) {
    write(k, MARGIN, { color: rgb(0.4, 0.4, 0.4) });
    write(v, MARGIN + 170, { bold: true });
    y -= 14;
  }
  y -= 12;

  const byEntity = groupTotals(lines, (l) => ({
    key: l.entityCode ?? "-",
    label: l.entityCode ?? "Unassigned",
    color: l.entityColor ?? undefined,
  }));
  if (byEntity.length) {
    write("By entity", MARGIN, { bold: true });
    y -= 15;
    const max = Math.max(...byEntity.map((g) => g.total));
    const barMax = 240;
    for (const g of byEntity) {
      newPageIfNeeded(16);
      write(g.label, MARGIN, { size: 9 });
      page.drawRectangle({
        x: MARGIN + 80,
        y: y - 1,
        width: Math.max((g.total / max) * barMax, 1),
        height: 8,
        color: hexToRgb(g.color),
      });
      write(money(g.total), MARGIN + 80 + barMax + 10, { size: 9 });
      y -= 14;
    }
    y -= 14;
  }

  const ds = buildDataset("transactions", lines, summary, period, view);
  const pick = [0, 4, 5, 6, 3, 9]; // Date, person, Entity, Category, Merchant/trip, Entered
  const heads = ["Date", personLabel, "Entity", "Category", "Merchant / trip", "Amount"];
  const colX = [MARGIN, MARGIN + 66, MARGIN + 168, MARGIN + 206, MARGIN + 298, PAGE_W - MARGIN - 52];
  const colW = [62, 96, 34, 88, 150, 52];

  newPageIfNeeded(30);
  write(`Transactions (${ds.rows.length})`, MARGIN, { bold: true });
  y -= 15;
  const drawHeadRow = () => {
    heads.forEach((h, i) => write(h, colX[i], { size: 8, bold: true, color: rgb(0.45, 0.45, 0.45) }));
    y -= 12;
  };
  drawHeadRow();

  for (const row of ds.rows) {
    if (newPageIfNeeded(12)) drawHeadRow();
    pick.forEach((srcIdx, i) => {
      const raw = row[srcIdx];
      if (srcIdx === 9) {
        write(money(Math.round(Number(raw) * 100)), colX[i], { size: 8 });
      } else {
        write(fit(String(raw ?? ""), font, 8, colW[i]), colX[i], { size: 8 });
      }
    });
    y -= 11;
  }

  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
