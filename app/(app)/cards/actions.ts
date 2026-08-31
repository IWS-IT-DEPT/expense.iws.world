"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { cardNetwork, cards, pendingExpenses } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

export interface RegisterCardState {
  ok?: boolean;
  error?: string;
}

const NETWORKS = cardNetwork.enumValues as readonly string[];

/** A cardholder registers one of their company cards. Takes effect immediately. */
export async function registerCard(
  _prev: RegisterCardState,
  fd: FormData,
): Promise<RegisterCardState> {
  const user = await requireUser();

  const last4 = String(fd.get("last4") || "").trim();
  const network = String(fd.get("network") || "");
  const displayName = String(fd.get("displayName") || "").trim() || null;

  if (!/^\d{4}$/.test(last4)) return { error: "Enter the last 4 digits of the card." };
  if (!NETWORKS.includes(network)) return { error: "Pick the card network." };

  const existing = await db.query.cards.findFirst({
    where: and(eq(cards.userId, user.id), eq(cards.last4, last4)),
  });
  if (existing) {
    if (existing.active) return { error: "You've already registered a card ending " + last4 + "." };
    await db
      .update(cards)
      .set({ active: true, network: network as (typeof cardNetwork.enumValues)[number], displayName })
      .where(eq(cards.id, existing.id));
    revalidatePath("/cards");
    return { ok: true };
  }

  await db.insert(cards).values({
    userId: user.id,
    last4,
    network: network as (typeof cardNetwork.enumValues)[number],
    displayName,
    active: true,
  });
  revalidatePath("/cards");
  revalidatePath("/expenses/new");
  return { ok: true };
}

/** Deactivate a card. Kept (not deleted) if any expense references it. */
export async function removeMyCard(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");

  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card || card.userId !== user.id) return;

  const used = await db.query.pendingExpenses.findFirst({
    where: eq(pendingExpenses.cardId, id),
    columns: { id: true },
  });
  if (used) {
    await db.update(cards).set({ active: false }).where(eq(cards.id, id));
  } else {
    await db.delete(cards).where(eq(cards.id, id));
  }
  revalidatePath("/cards");
}
