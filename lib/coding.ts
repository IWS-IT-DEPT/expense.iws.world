import { z } from "zod";

/**
 * The coding wizard. A cardholder codes every charge by answering, in order:
 *
 *   1. Who is this for?      -> entity
 *   2. Which site?           -> location   (entity's own sites listed first)
 *   3. Which truck / job?    -> unit or job, only when the entity requires it
 *   4. What kind of expense? -> category
 *   5. Why?                  -> businessPurpose
 *
 * The result is a structured `CodingInput` plus a human-readable tag such as
 *   "RGT · Main Office · Truck 07 · Fuel"
 */

export type CostingMode = "none" | "unit" | "job" | "unit_or_job";

export interface CodingContext {
  entity: { id: string; code: string; name: string; costingMode: CostingMode };
  location: { id: string; code: string; name: string };
  unit?: { id: string; unitNumber: string } | null;
  job?: { id: string; jobNumber: string } | null;
  category: { id: string; code: string; name: string; requiresJobOrUnit: boolean };
}

export const codingInputSchema = z.object({
  entityId: z.string().uuid(),
  locationId: z.string().uuid(),
  unitId: z.string().uuid().nullish(),
  jobId: z.string().uuid().nullish(),
  categoryId: z.string().uuid(),
  businessPurpose: z.string().trim().min(4, "Add a short business purpose"),
  amountCents: z.number().int(),
});

export type CodingInput = z.infer<typeof codingInputSchema>;

export interface CodingRules {
  needsUnit: boolean;
  needsJob: boolean;
  needsUnitOrJob: boolean;
}

/** What the wizard must collect, given the chosen entity + category. */
export function codingRules(
  costingMode: CostingMode,
  category?: { requiresJobOrUnit: boolean } | null,
): CodingRules {
  const categoryForces = category?.requiresJobOrUnit ?? false;
  return {
    needsUnit: costingMode === "unit",
    needsJob: costingMode === "job",
    needsUnitOrJob: costingMode === "unit_or_job" || (categoryForces && costingMode === "none"),
  };
}

export interface CodingProblem {
  field: "entityId" | "locationId" | "unitId" | "jobId" | "categoryId" | "businessPurpose";
  message: string;
}

/** Validates a single allocation against the entity/category rules. */
export function validateCoding(ctx: {
  costingMode: CostingMode;
  hasUnit: boolean;
  hasJob: boolean;
  category?: { requiresJobOrUnit: boolean } | null;
  businessPurpose: string;
}): CodingProblem[] {
  const rules = codingRules(ctx.costingMode, ctx.category);
  const problems: CodingProblem[] = [];

  if (rules.needsUnit && !ctx.hasUnit) {
    problems.push({ field: "unitId", message: "This entity requires a unit / truck." });
  }
  if (rules.needsJob && !ctx.hasJob) {
    problems.push({ field: "jobId", message: "This entity requires a job number." });
  }
  if (rules.needsUnitOrJob && !ctx.hasUnit && !ctx.hasJob) {
    problems.push({ field: "jobId", message: "Pick a job or a unit for this expense." });
  }
  if (ctx.businessPurpose.trim().length < 4) {
    problems.push({ field: "businessPurpose", message: "Add a short business purpose." });
  }
  return problems;
}

/** "RGT · Main Office · Truck 07 · Fuel" */
export function codingTag(ctx: CodingContext): string {
  const parts = [ctx.entity.code, ctx.location.name];
  if (ctx.unit) parts.push(ctx.unit.unitNumber);
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
