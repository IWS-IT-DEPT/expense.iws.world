import { z } from "zod";

/**
 * The coding wizard. A cardholder codes every charge by answering, in order:
 *
 *   1. Who is this for?      -> entity
 *   2. Which site?           -> location   (entity's own sites listed first)
 *   3. Which job?            -> job, only when the entity requires it
 *   4. What kind of expense? -> category
 *   5. Why?                  -> businessPurpose
 *
 * The result is a structured `CodingInput` plus a human-readable tag such as
 *   "RGT · Main Office · Fuel"
 */

/**
 * The DB enum still carries the retired "unit" / "unit_or_job" values (trucks
 * are gone); `effectiveCostingMode` folds them away — "unit" → nothing extra,
 * "unit_or_job" → job.
 */
export type CostingMode = "none" | "unit" | "job" | "unit_or_job";

export interface CodingContext {
  entity: { id: string; code: string; name: string; costingMode: CostingMode };
  location: { id: string; code: string; name: string };
  job?: { id: string; jobNumber: string } | null;
  category: { id: string; code: string; name: string };
}

export const codingInputSchema = z.object({
  entityId: z.string().uuid(),
  locationId: z.string().uuid(),
  jobId: z.string().uuid().nullish(),
  categoryId: z.string().uuid(),
  businessPurpose: z.string().trim().min(4, "Add a short business purpose"),
  amountCents: z.number().int(),
});

export type CodingInput = z.infer<typeof codingInputSchema>;

/**
 * The costing mode the coding rules actually apply: retired unit modes folded
 * away, and a job-exempt person is never asked for a job code.
 */
export function effectiveCostingMode(mode: CostingMode, jobExempt?: boolean | null): "none" | "job" {
  const m = mode === "job" || mode === "unit_or_job" ? "job" : "none";
  return jobExempt ? "none" : m;
}

export interface CodingRules {
  needsJob: boolean;
}

/** What the wizard must collect, given the chosen entity's costing mode. */
export function codingRules(costingMode: CostingMode): CodingRules {
  return { needsJob: effectiveCostingMode(costingMode) === "job" };
}

export interface CodingProblem {
  field: "entityId" | "locationId" | "jobId" | "categoryId" | "businessPurpose";
  message: string;
}

/** Validates a single allocation against the entity rules. */
export function validateCoding(ctx: {
  costingMode: CostingMode;
  hasJob: boolean;
  businessPurpose: string;
}): CodingProblem[] {
  const rules = codingRules(ctx.costingMode);
  const problems: CodingProblem[] = [];

  if (rules.needsJob && !ctx.hasJob) {
    problems.push({ field: "jobId", message: "This entity requires a job number." });
  }
  if (ctx.businessPurpose.trim().length < 4) {
    problems.push({ field: "businessPurpose", message: "Add a short business purpose." });
  }
  return problems;
}

/** "RGT · Main Office · Fuel" */
export function codingTag(ctx: CodingContext): string {
  const parts = [ctx.entity.code, ctx.location.name];
  if (ctx.job) parts.push(`Job ${ctx.job.jobNumber}`);
  parts.push(ctx.category.name);
  return parts.join(" · ");
}

/** True when the purchase is for a different entity than the card's owner. */
export function isIntercompany(allocationEntityId: string, cardOwningEntityId: string): boolean {
  return allocationEntityId !== cardOwningEntityId;
}

/** Splits must sum to the transaction total. */
export function splitsBalance(txnAmountCents: number, allocationCents: number[]): boolean {
  return allocationCents.reduce((a, b) => a + b, 0) === txnAmountCents;
}
