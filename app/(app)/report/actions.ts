"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { approvals, expenseReports, transactions } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

/** Submits the cardholder's weekly report: bundles that week's coded charges. */
export async function submitWeeklyReport(formData: FormData): Promise<void> {
  const user = await requireUser();
  const periodStart = String(formData.get("periodStart"));
  const periodEnd = String(formData.get("periodEnd"));

  const coded = await db.query.transactions.findMany({
    where: and(
      eq(transactions.assignedUserId, user.id),
      eq(transactions.status, "coded"),
      gte(transactions.txnDate, periodStart),
      lte(transactions.txnDate, periodEnd),
    ),
  });
  if (coded.length === 0) return;

  const existing = await db.query.expenseReports.findFirst({
    where: and(eq(expenseReports.userId, user.id), eq(expenseReports.periodStart, periodStart)),
  });

  const reportId =
    existing?.id ??
    (
      await db
        .insert(expenseReports)
        .values({ userId: user.id, periodStart, periodEnd, status: "submitted", submittedAt: new Date() })
        .returning({ id: expenseReports.id })
    )[0].id;

  if (existing) {
    await db
      .update(expenseReports)
      .set({ status: "submitted", submittedAt: new Date(), periodEnd })
      .where(eq(expenseReports.id, reportId));
  }

  await db
    .update(transactions)
    .set({ status: "submitted", reportId, updatedAt: new Date() })
    .where(inArray(transactions.id, coded.map((t) => t.id)));

  await db.insert(approvals).values({
    subjectType: "expense_report",
    subjectId: reportId,
    action: "submit",
    actorId: user.id,
    note: `${coded.length} transactions`,
  });

  revalidatePath("/report");
  revalidatePath("/");
}
