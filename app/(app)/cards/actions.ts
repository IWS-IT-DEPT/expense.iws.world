"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { cardAccounts, cards } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

export interface RegisterCardState {
  ok?: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/cards");
  revalidatePath("/admin/cards");
  revalidatePath("/admin");
}

/** A cardholder registers (or claims) a card. It stays `pending` until an admin approves. */
export async function registerCard(
  _prev: RegisterCardState,
  fd: FormData,
): Promise<RegisterCardState> {
  const user = await requireUser();

  const cardAccountId = String(fd.get("cardAccountId") || "");
  const last4 = String(fd.get("last4") || "").trim();
  const displayName = String(fd.get("displayName") || "").trim() || null;

  if (!/^\d{4}$/.test(last4)) return { error: "Enter the last 4 digits of the card." };

  const account = await db.query.cardAccounts.findFirst({
    where: and(eq(cardAccounts.id, cardAccountId), eq(cardAccounts.active, true)),
  });
  if (!account) return { error: "Pick a card program." };

  const existing = await db.query.cards.findFirst({
    where: and(eq(cards.cardAccountId, cardAccountId), eq(cards.last4, last4)),
  });

  if (!existing) {
    await db.insert(cards).values({
      cardAccountId,
      last4,
      displayName,
      userId: user.id,
      approvalStatus: "pending",
      requestedById: user.id,
      active: true,
    });
  } else if (existing.userId && existing.userId !== user.id) {
    return { error: "That card is already registered to someone else — ask IT if that's wrong." };
  } else if (existing.userId === user.id && existing.approvalStatus === "approved") {
    return { error: "You've already registered that card." };
  } else {
    await db
      .update(cards)
      .set({
        userId: user.id,
        approvalStatus: "pending",
        requestedById: user.id,
        displayName: displayName ?? existing.displayName,
      })
      .where(eq(cards.id, existing.id));
  }

  revalidate();
  return { ok: true };
}

/** Remove a card the current user registered (only while not yet approved). */
export async function removeMyCard(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(fd.get("id") || "");

  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card || card.userId !== user.id || card.approvalStatus === "approved") return;

  if (card.requestedById === user.id) {
    // self-created row — remove it entirely
    await db.delete(cards).where(eq(cards.id, id));
  } else {
    // an admin-created card the user had claimed — just release it
    await db
      .update(cards)
      .set({ userId: null, approvalStatus: "approved", requestedById: null })
      .where(eq(cards.id, id));
  }

  revalidate();
}
