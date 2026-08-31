"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseItems, expenseReports, pendingExpenses } from "@/db/schema";
import type { CostingMode } from "@/lib/coding";
import { requireUser } from "@/lib/current-user";
import { checkExpenseLine, isBlocked } from "@/lib/expense-checks";

export interface SubmitState {
  ok?: boolean;
  error?: string;
}

const OPEN = ["draft", "rejected"] as const;

/** Bundle the week's expenses into a submitted report and lock them. */
export async function submitWeek(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await requireUser();
  const periodStart = String(fd.get("periodStart") || "");
  const periodEnd = String(fd.get("periodEnd") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return { error: "Bad period." };
  }

  const cardLines = await db.query.pendingExpenses.findMany({
    where: and(
      eq(pendingExpenses.userId, user.id),
      inArray(pendingExpenses.status, [...OPEN]),
      isNull(pendingExpenses.reportId),
      lte(pendingExpenses.purchaseDate, periodEnd),
    ),
    with: { entity: true, category: true, receipts: { columns: { id: true } } },
  });
  const itemLines = await db.query.expenseItems.findMany({
    where: and(
      eq(expenseItems.userId, user.id),
      inArray(expenseItems.status, [...OPEN]),
      isNull(expenseItems.reportId),
      lte(expenseItems.itemDate, periodEnd),
    ),
    with: { entity: true, category: true, receipts: { columns: { id: true } } },
  });

  if (cardLines.length === 0 && itemLines.length === 0) {
    return { error: "Nothing to submit yet." };
  }

  const blocked = [
    ...cardLines.map((r) =>
      checkExpenseLine({
        kind: "card",
        amountCents: r.amountCents,
        entityId: r.entityId,
        locationId: r.locationId,
        categoryId: r.categoryId,
        businessPurpose: r.businessPurpose,
        unitId: r.unitId,
        jobId: r.jobId,
        cardId: r.cardId,
        receiptCount: r.receipts.length,
        costingMode: r.entity?.costingMode as CostingMode | undefined,
        categoryRequiresJobOrUnit: r.category?.requiresJobOrUnit,
      }),
    ),
    ...itemLines.map((r) =>
      checkExpenseLine({
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
      }),
    ),
  ].some(isBlocked);
  if (blocked) return { error: "Some lines still need attention — fix those first." };

  // upsert the report (neon-http: no interactive tx — guarded sequential writes)
  await db
    .insert(expenseReports)
    .values({
      userId: user.id,
      periodStart,
      periodEnd,
      status: "submitted",
      submittedAt: new Date(),
    })
    .onConflictDoNothing({ target: [expenseReports.userId, expenseReports.periodStart] });

  const report = await db.query.expenseReports.findFirst({
    where: and(eq(expenseReports.userId, user.id), eq(expenseReports.periodStart, periodStart)),
  });
  if (!report) return { error: "Could not open the report." };
  if (report.status === "reconciled" || report.status === "approved") {
    return { error: "This week's report is already locked." };
  }
  if (report.status !== "submitted") {
    await db
      .update(expenseReports)
      .set({ status: "submitted", submittedAt: new Date(), periodEnd, updatedAt: new Date() })
      .where(eq(expenseReports.id, report.id));
  }

  await db
    .update(pendingExpenses)
    .set({ status: "submitted", submittedAt: new Date(), reportId: report.id, updatedAt: new Date() })
    .where(
      and(
        eq(pendingExpenses.userId, user.id),
        inArray(pendingExpenses.status, [...OPEN]),
        isNull(pendingExpenses.reportId),
        lte(pendingExpenses.purchaseDate, periodEnd),
      ),
    );
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
    note: `${cardLines.length} card / ${itemLines.filter((i) => i.kind === "out_of_pocket").length} oop / ${itemLines.filter((i) => i.kind === "mileage").length} mileage`,
  });

  revalidatePath("/report");
  revalidatePath("/expenses");
  revalidatePath("/");
  return { ok: true };
}
