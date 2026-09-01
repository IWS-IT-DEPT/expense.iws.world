"use server";

import { revalidatePath } from "next/cache";
import { eq, isNotNull, isNull, and, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { errorLogs } from "@/db/schema";
import { requireRole } from "@/lib/current-user";

export async function resolveError(fd: FormData): Promise<void> {
  await requireRole("admin");
  const fingerprint = String(fd.get("fingerprint") || "");
  if (!fingerprint) return;
  await db
    .update(errorLogs)
    .set({ resolvedAt: new Date() })
    .where(and(eq(errorLogs.fingerprint, fingerprint), isNull(errorLogs.resolvedAt)));
  revalidatePath("/admin/errors");
  revalidatePath("/admin");
}

export async function reopenError(fd: FormData): Promise<void> {
  await requireRole("admin");
  const fingerprint = String(fd.get("fingerprint") || "");
  if (!fingerprint) return;
  await db
    .update(errorLogs)
    .set({ resolvedAt: null })
    .where(eq(errorLogs.fingerprint, fingerprint));
  revalidatePath("/admin/errors");
  revalidatePath("/admin");
}

/** Drop resolved rows and anything older than 30 days. */
export async function clearResolvedErrors(): Promise<void> {
  await requireRole("admin");
  await db.delete(errorLogs).where(isNotNull(errorLogs.resolvedAt));
  await db.delete(errorLogs).where(lt(errorLogs.createdAt, sql`now() - interval '30 days'`));
  revalidatePath("/admin/errors");
  revalidatePath("/admin");
}
