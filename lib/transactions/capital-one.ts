import { last4, parseRows, syntheticId, toCents, toIsoDate } from "./csv-common";
import type { ParseResult, TransactionSource } from "./types";

/**
 * Capital One business card CSV export.
 * Columns: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
 * Debit = a charge (expense), Credit = a payment/refund.
 * Covers both the IWS and the Precision Capital One accounts.
 */
export const capitalOneSource: TransactionSource = {
  key: "capital_one",

  parseCsv(csvText: string): ParseResult {
    const rows = parseRows(csvText);
    const transactions: ParseResult["transactions"] = [];
    const skipped: ParseResult["skipped"] = [];

    rows.forEach((row, i) => {
      const txnDate = toIsoDate(row["Transaction Date"] ?? row["Trans Date"]);
      const debit = toCents(row["Debit"]);
      const credit = toCents(row["Credit"]);
      const merchant = (row["Description"] ?? "").trim();

      if (!txnDate || (debit == null && credit == null) || !merchant) {
        skipped.push({ row: i + 2, reason: "missing date, amount or description" });
        return;
      }

      const amountCents = debit != null ? debit : -(credit ?? 0);
      const cardLast4 = last4(row["Card No."] ?? row["Card No"]);
      const postDate = toIsoDate(row["Posted Date"] ?? row["Post Date"]);

      transactions.push({
        externalId: syntheticId([txnDate, postDate, cardLast4, merchant, amountCents]),
        cardLast4,
        txnDate,
        postDate,
        amountCents,
        merchantRaw: merchant,
        descriptionRaw: row["Category"]?.trim() || null,
        mcc: null,
        currency: "USD",
      });
    });

    return { transactions, skipped };
  },
};
