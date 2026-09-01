"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { checkExpenseLine, isBlocked, loadPolicy } from "@/lib/expense-checks";

export interface SubmitState {
  ok?: boolean;
  error?: string;
}

const OPEN = ["draft", "rejected"] as const;

/**
 * Submit the week's out-of-pocket + mileage into one reimbursement report.
 * Card purchases are submitted individually (see submitCardExpense) and don't
 * ride on this.
 */
export async function submitWeek(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await requireUser();
  const periodStart = String(fd.get("periodStart") || "");
  const periodEnd = String(fd.get("periodEnd") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return { error: "Bad period." };
  }

  const itemLines = await db.query.expenseItems.findMany({
    where: and(
      eq(expenseItems.userId, user.id),
      inArray(expenseItems.status, [...OPEN]),
      isNull(expenseItems.reportId),
      lte(expenseItems.itemDate, periodEnd),
    ),
    with: { entity: true, category: true, receipts: { columns: { id: true } } },
  });
  if (itemLines.length === 0) return { error: "No reimbursements to submit yet." };

  const policy = await loadPolicy();
  const blocked = itemLines
    .map((r) =>
      checkExpenseLine(
        {
          kind: r.kind,
          amountCents: r.amountCents,
          entityId: r.entityId,
          locationId: r.locationId,
          categoryId: r.categoryId,
          businessPurpose: r.businessPurpose,
          unitId: r.unitId,
          jobId: r.jobId,
          receiptCount: r.receipts.length,
          costingMode: r.entity?.costingMode as CostingMode | undefined,
          categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
        },
        policy,
      ),
    )
    .some(isBlocked);
  if (blocked) return { error: "Some reimbursements still need attention — fix those first." };

  await db
    .insert(expenseReports)
    .values({ userId: user.id, periodStart, periodEnd, status: "submitted", submittedAt: new Date() })
    .onConflictDoNothing({ target: [expenseReports.userId, expenseReports.periodStart] });

  const report = await db.query.expenseReports.findFirst({
    where: and(eq(expenseReports.userId, user.id), eq(expenseReports.periodStart, periodStart)),
  });
  if (!report) return { error: "Could not open the report." };
  if (report.status === "approved") return { error: "This week's reimbursements are already approved." };
  if (report.status !== "submitted") {
    await db
      .update(expenseReports)
      .set({ status: "submitted", submittedAt: new Date(), periodEnd, updatedAt: new Date() })
      .where(eq(expenseReports.id, report.id));
  }

  await db
    .update(expenseItems)
    .set({ status: "submitted", reportId: report.id, updatedAt: new Date() })
    .where(
      and(
        eq(expenseItems.userId, user.id),
        inArray(expenseItems.status, [...OPEN]),
        isNull(expenseItems.reportId),
        lte(expenseItems.itemDate, periodEnd),
      ),
    );

  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: report.id,
    action: "submit",
    actorId: user.id,
    note: `${itemLines.filter((i) => i.kind === "out_of_pocket").length} oop / ${itemLines.filter((i) => i.kind === "mileage").length} mileage`,
  });

  revalidatePath("/report");
  revalidatePath("/expenses");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}
