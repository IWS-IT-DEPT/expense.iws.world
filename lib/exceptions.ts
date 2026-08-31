import type { flagSeverity, flagType } from "@/db/schema";

/**
 * The rules behind Allie's approve-by-exception queue. A transaction (or expense
 * item) with zero unresolved flags is "clean" and can be batch-approved;
 * anything with a flag surfaces individually.
 */

type FlagType = (typeof flagType.enumValues)[number];
type FlagSeverity = (typeof flagSeverity.enumValues)[number];

export interface ComputedFlag {
  type: FlagType;
  severity: FlagSeverity;
  detail: string;
}

export interface ExpensePolicy {
  /** Receipts required at or above this charge amount (cents). */
  receiptThresholdCents: number;
  /** Charges at or above this amount always surface for review. */
  reviewThresholdCents: number;
}

export const DEFAULT_POLICY: ExpensePolicy = {
  receiptThresholdCents: 7500, // IRS substantiation floor
  reviewThresholdCents: 50000,
};

export interface FlagCheckInput {
  amountCents: number;
  hasReceipt: boolean;
  receiptAlwaysRequired: boolean;
  isCoded: boolean;
  isIntercompany: boolean;
  splitsBalance: boolean;
  merchantIsNew: boolean;
  duplicateOf?: string | null;
  policy?: ExpensePolicy;
}

export function computeFlags(input: FlagCheckInput): ComputedFlag[] {
  const policy = input.policy ?? DEFAULT_POLICY;
  const flags: ComputedFlag[] = [];
  const charge = Math.abs(input.amountCents);

  if (!input.isCoded) {
    flags.push({ type: "uncategorized", severity: "block", detail: "Not fully coded yet." });
  }

  const receiptRequired =
    input.receiptAlwaysRequired || charge >= policy.receiptThresholdCents;
  if (receiptRequired && !input.hasReceipt) {
    flags.push({
      type: "missing_receipt",
      severity: "block",
      detail: `Receipt required for charges of $${(policy.receiptThresholdCents / 100).toFixed(0)}+.`,
    });
  }

  if (charge >= policy.reviewThresholdCents) {
    flags.push({
      type: "over_threshold",
      severity: "warn",
      detail: `Charge is $${(charge / 100).toFixed(2)}.`,
    });
  }

  if (!input.splitsBalance) {
    flags.push({
      type: "split_mismatch",
      severity: "block",
      detail: "Split allocations do not sum to the charge total.",
    });
  }

  if (input.isIntercompany) {
    flags.push({
      type: "intercompany",
      severity: "info",
      detail: "Purchased for a different entity than the card owner.",
    });
  }

  if (input.merchantIsNew) {
    flags.push({
      type: "new_merchant",
      severity: "warn",
      detail: "First charge to this merchant.",
    });
  }

  if (input.duplicateOf) {
    flags.push({
      type: "possible_duplicate",
      severity: "warn",
      detail: `Same amount + merchant + date as transaction ${input.duplicateOf}.`,
    });
  }

  return flags;
}

/** Clean = no blocking or warning flags (info-level, e.g. intercompany, is fine). */
export function isClean(flags: { severity: FlagSeverity; resolved?: boolean }[]): boolean {
  return flags.every((f) => f.resolved || f.severity === "info");
}
