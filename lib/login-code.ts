import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { loginCodes, users } from "@/db/schema";

import { sendEmail } from "./email";
import { rateLimit } from "./rate-limit";

/**
 * Emailed one-time sign-in codes, for people without a Microsoft 365 account.
 *
 * Who: only users an admin flagged `emailLogin`, active, and NOT on an allowed M365
 * domain or the break-glass admin list (those must go through Entra and its MFA).
 * The code goes to the address on file, so that mailbox is the credential — which is
 * why it's admin-granted per person, short-lived, single-use and attempt-capped.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const m365Domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);
const bootstrapAdmins = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** An address that must sign in through Microsoft 365, so a code can never stand in for it. */
export function mustUseM365(email: string): boolean {
  return bootstrapAdmins.includes(email) || m365Domains.some((d) => email.endsWith(`@${d}`));
}

function hashCode(userId: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(`login-code:${userId}:${code}`).digest("hex");
}

async function eligibleUser(email: string) {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.active || !user.emailLogin || mustUseM365(user.email)) return null;
  return user;
}

export const normalizeEmail = (raw: unknown) => String(raw ?? "").trim().toLowerCase();

/**
 * Email a fresh code if this address is eligible. Always resolves the same way, so
 * callers can't be used to discover who has an account.
 */
export async function issueLoginCode(rawEmail: string, ip: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  if (!(await rateLimit(`login-code:ip:${ip}`, 20, 15 * 60))) return;
  if (!(await rateLimit(`login-code:email:${email}`, 5, 15 * 60))) return;

  const user = await eligibleUser(email);
  if (!user) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Only the newest code works.
  await db
    .update(loginCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(loginCodes.userId, user.id), isNull(loginCodes.usedAt)));
  await db.insert(loginCodes).values({
    userId: user.id,
    codeHash: hashCode(user.id, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  if (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) {
    console.info(`[login-code] dev only — code for ${email}: ${code}`);
  }
  try {
    await sendEmail({
      to: user.email,
      subject: `Your IWS Expense sign-in code: ${code}`,
      text:
        `Your IWS Expense sign-in code is ${code}.\n\n` +
        `It works once and expires in 10 minutes. If you didn't ask for it, ignore this email — ` +
        `nobody can sign in without the code.`,
    });
  } catch (err) {
    console.error("[login-code] email failed:", err instanceof Error ? err.message : err);
  }
}

/** Check a code. On success it's burned and the user is returned. */
export async function verifyLoginCode(rawEmail: string, rawCode: string, ip: string) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  if (!(await rateLimit(`login-verify:ip:${ip}`, 40, 15 * 60))) return null;
  if (!(await rateLimit(`login-verify:email:${email}`, 15, 15 * 60))) return null;

  const user = await eligibleUser(email);
  if (!user) return null;

  const row = await db.query.loginCodes.findFirst({
    where: and(eq(loginCodes.userId, user.id), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date())),
    orderBy: [desc(loginCodes.createdAt)],
  });
  if (!row) return null;

  // Count the attempt first (atomically), so concurrent guesses can't dodge the cap.
  const [bumped] = await db
    .update(loginCodes)
    .set({ attempts: sql`${loginCodes.attempts} + 1` })
    .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.usedAt)))
    .returning({ attempts: loginCodes.attempts });
  if (!bumped || bumped.attempts > MAX_ATTEMPTS) {
    await db.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, row.id));
    return null;
  }

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(user.id, code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  // Burn it; if another request already did, this one loses.
  const [burned] = await db
    .update(loginCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(loginCodes.id, row.id), isNull(loginCodes.usedAt)))
    .returning({ id: loginCodes.id });
  return burned ? user : null;
}
