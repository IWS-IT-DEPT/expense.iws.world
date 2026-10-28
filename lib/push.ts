import { eq } from "drizzle-orm";
import webpush from "web-push";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/**
 * Web push (the installed app's notifications). Everything here is best-effort:
 * a push failure must never break the action that triggered it, and callers
 * treat "0 delivered" as "send the email instead".
 *
 * Needs VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (see .env.example). Without them
 * push is simply off.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim();
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
const SUBJECT = `mailto:${process.env.MAIL_FROM?.trim() || "expense@iws.world"}`;

export const pushConfigured = !!(PUBLIC_KEY && PRIVATE_KEY);
/** Public key for the browser — only when sending is also possible, so the UI never offers a dead toggle. */
export const pushPublicKey: string | undefined = pushConfigured ? PUBLIC_KEY : undefined;
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);

/** Testing mode (all email redirected to one address): never push to real people. */
const TEST_MODE = !!process.env.EMAIL_REDIRECT_TO?.trim();

export interface PushPayload {
  title: string;
  body: string;
  /** where tapping the notification goes (path on this site) */
  url: string;
  /** same tag replaces an earlier notification instead of stacking */
  tag?: string;
}

/**
 * Push to every device a user has enabled. Returns how many were delivered
 * (0 = none enabled / push off / test mode), so callers can fall back to email.
 * `force` bypasses test mode — used by the "send me a test" button.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: { force?: boolean } = {},
): Promise<number> {
  if (!pushConfigured || (TEST_MODE && !opts.force)) return 0;
  try {
    const subs = await db.query.pushSubscriptions.findMany({
      where: eq(pushSubscriptions.userId, userId),
    });
    let delivered = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 12 * 60 * 60, urgency: "normal" },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the phone uninstalled or revoked it — forget the subscription.
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          console.warn("[push] send failed:", status ?? (err instanceof Error ? err.message : err));
        }
      }
    }
    return delivered;
  } catch (err) {
    console.warn("[push] failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
