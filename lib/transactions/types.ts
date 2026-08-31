/**
 * A `TransactionSource` turns raw card data (a CSV export today, a Teller API
 * feed later) into `NormalizedTransaction`s. The import pipeline is written
 * against this interface so adding Teller is a new file, not a rewrite.
 */

export interface NormalizedTransaction {
  /** Stable, source-provided identifier for idempotent re-import. */
  externalId: string;
  /** Last 4 of the card, when the export provides it. */
  cardLast4: string | null;
  /** ISO date (YYYY-MM-DD). */
  txnDate: string;
  postDate: string | null;
  /** Integer cents. Positive = charge/expense, negative = credit/refund. */
  amountCents: number;
  merchantRaw: string;
  descriptionRaw: string | null;
  mcc: string | null;
  currency: string;
}

export interface ParseResult {
  transactions: NormalizedTransaction[];
  /** Rows that could not be parsed, with a reason — surfaced to the importer. */
  skipped: { row: number; reason: string }[];
}

export interface TransactionSource {
  readonly key: string;
  /** Parse an uploaded statement file. */
  parseCsv(csvText: string): ParseResult;
}
