"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { approvals, exceptionFlags, transactions } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

async function logApproval(
  subjectId: string,
  action: "approve" | "reject" | "review",
  actorId: string,
  note?: string,
) {
  await db.insert(approvals).values({
    subjectType: "transaction",
    subjectId,
    action,
    actorId,
    note,
  });
}

/** Approve every submitted/in-review transaction that has no open warn/block flag. */
export async function approveClean(): Promise<void> {
  const user = await requireRole("accounting", "approver", "admin");

  const candidates = await db.query.transactions.findMany({
    where: inArray(transactions.status, ["submitted", "in_review"]),
    with: { flags: true },
  });

  const cleanIds = candidates
    .filter((t) => t.flags.every((f) => f.resolved || f.severity === "info"))
    .map((t) => t.id);

  if (cleanIds.length) {
    await db
      .update(transactions)
      .set({ status: "approved", updatedAt: new Date() })
      .where(inArray(transactions.id, cleanIds));
    for (const id of cleanIds) await logApproval(id, "approve", user.id, "batch: clean");
  }

  revalidatePath("/review");
  revalidatePath("/");
}

export async function approveOne(formData: FormData): Promise<void> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(formData.get("transactionId"));
  await db
    .update(transactions)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(transactions.id, id), inArray(transactions.status, ["submitted", "in_review"])));
  await logApproval(id, "approve", user.id);
  revalidatePath("/review");
}

export async function rejectOne(formData: FormData): Promise<void> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(formData.get("transactionId"));
  const reason = String(formData.get("reason") || "Sent back for changes");
  await db
    .update(transactions)
    .set({ status: "rejected", notes: reason, updatedAt: new Date() })
    .where(eq(transactions.id, id));
  await logApproval(id, "reject", user.id, reason);
  revalidatePath("/review");
}

export async function resolveFlag(formData: FormData): Promise<void> {
  const user = await requireRole("accounting", "approver", "admin");
  const id = String(formData.get("flagId"));
  await db
    .update(exceptionFlags)
    .set({ resolved: true, resolvedById: user.id, resolvedAt: new Date() })
    .where(eq(exceptionFlags.id, id));
  revalidatePath("/review");
}
