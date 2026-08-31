import { amexSource } from "./amex";
import { capitalOneSource } from "./capital-one";
import type { TransactionSource } from "./types";

const sources: Record<string, TransactionSource> = {
  capital_one: capitalOneSource,
  amex: amexSource,
};

/** Look up a parser by a card account's `importProfile`. */
export function getTransactionSource(importProfile: string): TransactionSource {
  const source = sources[importProfile];
  if (!source) throw new Error(`No transaction source for import profile "${importProfile}"`);
  return source;
}

export type { NormalizedTransaction, ParseResult, TransactionSource } from "./types";
