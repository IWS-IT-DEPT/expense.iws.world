"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { deleteExpensesOf, deleteUsersAndData } from "@/lib/cleanup";
import { requireRole } from "@/lib/current-user";

/**
 * Permanently delete selected test users' expenses (`expenses`) or the users
 * themselves and everything they did (`accounts`). Admin only. The typed phrase
 * is verified here, not just in the form, and the count in it must match the
 * selection so a stale or tampered form can't delete something else.
 */
export async function runCleanup(fd: FormData): Promise<void> {
  const me = await requireRole("admin");

  const mode = String(fd.get("mode") ?? "");
  if (mode !== "expenses" && mode !== "accounts") return;

  const requested = [...new Set(fd.getAll("u").map(String).filter(Boolean))];
  if (requested.length === 0) return;

  // Only ids that really exist.
  const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, requested));
  const ids = found.map((r) => r.id);
  if (ids.length === 0 || ids.length !== requested.length) return;

  // An admin can wipe their own test expenses but never delete their own account.
  if (mode === "accounts" && ids.includes(me.id)) return;

  const phrase = mode === "accounts" ? `delete ${ids.length} users` : `clear ${ids.length} users`;
  if (String(fd.get("confirm") ?? "") !== phrase) return;

  const result =
    mode === "accounts"
      ? await deleteUsersAndData(ids)
      : { users: 0, ...(await deleteExpensesOf(ids)) };

  console.info(
    `[cleanup] ${me.email} ran "${mode}" on ${ids.length} users:`,
    JSON.stringify(result),
  );

  revalidatePath("/admin/cleanup");
  revalidatePath("/admin/users");
  revalidatePath("/expenses");
  const qs = new URLSearchParams({
    done: mode,
    users: String(result.users),
    cardExpenses: String(result.cardExpenses),
    items: String(result.items),
    reports: String(result.reports),
    receipts: String(result.receipts),
  });
  redirect(`/admin/cleanup?${qs.toString()}`);
}
