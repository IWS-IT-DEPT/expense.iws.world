import { z } from "zod";

/**
 * The coding wizard. A cardholder codes every charge by answering, in order:
 *
 *   1. Who is this for?      -> entity
 *   2. Which site?           -> location   (entity's own sites listed first)
 *   3. Which job?            -> job, only for a job/project category or a person who always codes jobs
 *   4. What kind of expense? -> category
 *   5. Why?                  -> businessPurpose
 *
 * The result is a structured `CodingInput` plus a human-readable tag such as
 *   "RGT · Main Office · Fuel"
 */

/**
 * `entities.costing_mode` (DB enum). Retired: it no longer drives the coding
 * rules — job codes are opt-in per category / per person (`codingRules`).
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

export interface CodingRules {
  needsJob: boolean;
}

/**
 * A job code is required only when the category is a job / project expense
 * (`categories.requiresJob`) or the person always codes jobs
 * (`users.requiresJobCode`). Everyone else is never asked.
 */
export function codingRules(ctx: {
  categoryRequiresJob?: boolean | null;
  userRequiresJob?: boolean | null;
}): CodingRules {
  return { needsJob: !!ctx.categoryRequiresJob || !!ctx.userRequiresJob };
}

export interface CodingProblem {
  field: "entityId" | "locationId" | "jobId" | "categoryId" | "businessPurpose";
  message: string;
}

/** Validates a single allocation against the entity rules. */
export function validateCoding(ctx: {
  categoryRequiresJob?: boolean | null;
  userRequiresJob?: boolean | null;
  hasJob: boolean;
  businessPurpose: string;
}): CodingProblem[] {
  const rules = codingRules(ctx);
  const problems: CodingProblem[] = [];

  if (rules.needsJob && !ctx.hasJob) {
    problems.push({ field: "jobId", message: "Pick the job this expense is for." });
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
