/** Collapse a raw merchant string to a stable key for matching / new-merchant detection. */
export function normalizeMerchant(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\b(SQ|TST|PAYPAL|POS|PURCHASE|DEBIT|CARD)\b/g, " ")
    .replace(/\d{3,}/g, " ") // store numbers, phone numbers
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
