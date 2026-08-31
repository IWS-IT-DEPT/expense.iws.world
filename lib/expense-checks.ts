import { codingRules, type CostingMode } from "./coding";

/**
 * The rules that decide whether an expense line is ready to submit / clean for
 * accounting. Pure — no DB. Recomputed wherever a line is shown (the weekly
 * report, the reconcile queue, the dashboard). Replaces the old
 * `exception_flags` machinery, which was tied to imported transactions.
 */

export interface ExpensePolicy {
  /** Receipt required at/above this amount (cents). */
  receiptThresholdCents: number;
  /** At/above this amount the line always surfaces for a closer look. */
  reviewThresholdCents: number;
}

export const DEFAULT_POLICY: ExpensePolicy = {
  receiptThresholdCents: 7500,
  reviewThresholdCents: 50000,
};

export type CheckSeverity = "info" | "warn" | "block";

export interface ExpenseCheck {
  code:
    | "uncoded"
    | "no_card"
    | "missing_receipt"
    | "over_threshold"
    | "possible_duplicate";
  severity: CheckSeverity;
  message: string;
}

export interface CheckLine {
  kind: "card" | "out_of_pocket" | "mileage";
  amountCents: number;
  entityId: string | null;
  locationId: string | null;
  categoryId: string | null;
  businessPurpose: string | null;
  unitId: string | null;
  jobId: string | null;
  cardId?: string | null;
  receiptCount: number;
  /** the chosen entity's costing mode + the chosen category's flags, if known */
  costingMode?: CostingMode;
  categoryRequiresJobOrUnit?: boolean;
  categoryReceiptAlwaysRequired?: boolean;
}

/** Returns the blocking + advisory checks for one line. Empty = ready. */
export function checkExpenseLine(
  line: CheckLine,
  policy: ExpensePolicy = DEFAULT_POLICY,
): ExpenseCheck[] {
  const checks: ExpenseCheck[] = [];
  const charge = Math.abs(line.amountCents);

  const rules = codingRules(
    line.costingMode ?? "none",
    line.categoryRequiresJobOrUnit != null
      ? { requiresJobOrUnit: line.categoryRequiresJobOrUnit }
      : null,
  );
  const codingComplete =
    !!line.entityId &&
    !!line.locationId &&
    !!line.categoryId &&
    !!line.businessPurpose?.trim() &&
    (!rules.needsUnit || !!line.unitId) &&
    (!rules.needsJob || !!line.jobId) &&
    (!rules.needsUnitOrJob || !!line.unitId || !!line.jobId);

  if (!codingComplete) {
    checks.push({ code: "uncoded", severity: "block", message: "Coding isn't complete." });
  }

  if (line.kind === "card" && !line.cardId) {
    checks.push({ code: "no_card", severity: "block", message: "Pick which card this was on." });
  }

  const receiptRequired =
    line.kind !== "mileage" &&
    (line.categoryReceiptAlwaysRequired || charge >= policy.receiptThresholdCents);
  if (receiptRequired && line.receiptCount === 0) {
    checks.push({
      code: "missing_receipt",
      severity: "block",
      message: `Receipt required for $${(policy.receiptThresholdCents / 100).toFixed(0)}+ (and some categories).`,
    });
  }

  if (charge >= policy.reviewThresholdCents) {
    checks.push({
      code: "over_threshold",
      severity: "warn",
      message: `Large amount — $${(charge / 100).toFixed(2)}.`,
    });
  }

  return checks;
}

export function isBlocked(checks: ExpenseCheck[]): boolean {
  return checks.some((c) => c.severity === "block");
}
