import Papa from "papaparse";
import { createHash } from "node:crypto";

export type CsvRow = Record<string, string>;

export function parseRows(csvText: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data.filter((r) => Object.keys(r).length > 0);
}

/** "$1,234.56" / "(12.34)" / "-12.34" -> integer cents. */
export function toCents(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const value = Number.parseFloat(s);
  if (Number.isNaN(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Accepts M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD -> ISO YYYY-MM-DD. */
export function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function last4(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * Deterministic id for exports that don't provide one (Capital One CSV). Stable
 * across re-imports of the same statement so dedupe works.
 */
export function syntheticId(parts: (string | number | null | undefined)[]): string {
  return createHash("sha1").update(parts.map((p) => p ?? "").join("|")).digest("hex");
}
