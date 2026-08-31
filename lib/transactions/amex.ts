import { last4, parseRows, syntheticId, toCents, toIsoDate } from "./csv-common";
import type { ParseResult, TransactionSource } from "./types";

/**
 * American Express CSV export (Rolling Green card).
 * Columns: Date, Description, Card Member, Account #, Amount, Extended Details, ...
 * Amex `Amount` is positive for a charge, negative for a credit — the opposite
 * sign convention from Capital One's split Debit/Credit columns.
 */
export const amexSource: TransactionSource = {
  key: "amex",

  parseCsv(csvText: string): ParseResult {
    const rows = parseRows(csvText);
    const transactions: ParseResult["transactions"] = [];
    const skipped: ParseResult["skipped"] = [];

    rows.forEach((row, i) => {
      const txnDate = toIsoDate(row["Date"]);
      const amountCents = toCents(row["Amount"]);
      const merchant = (row["Description"] ?? "").trim();

      if (!txnDate || amountCents == null || !merchant) {
        skipped.push({ row: i + 2, reason: "missing date, amount or description" });
        return;
      }

      const reference = (row["Reference"] ?? "").trim();
      const cardLast4 = last4(row["Account #"] ?? row["Card Member"]);

      transactions.push({
        externalId: reference || syntheticId([txnDate, merchant, amountCents, cardLast4]),
        cardLast4,
        txnDate,
        postDate: null,
        amountCents,
        merchantRaw: merchant,
        descriptionRaw: row["Extended Details"]?.trim() || null,
        mcc: (row["Category"] ?? "").trim() || null,
        currency: "USD",
      });
    });

    return { transactions, skipped };
  },
};
