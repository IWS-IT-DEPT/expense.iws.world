import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed tokens for receipt uploads. Used for the desktop→phone QR
 * handoff: the desktop mints a token scoped to {purpose, target, user} and
 * embeds it in the URL behind the QR code; the phone POSTs it back with the
 * scanned file. No login on the phone — the HMAC is the credential.
 *
 * The token is stateless. A matching `receipt_upload_sessions` row (id == `n`)
 * carries the pollable status and lets a session be treated as expired even
 * before the token's own `x` deadline.
 *
 * Node-only (uses `node:crypto`); import from route handlers / server actions,
 * never from an edge context.
 */

export type UploadPurpose = "txn" | "pending" | "bank" | "item";

export interface UploadTokenPayload {
  /** purpose */
  p: UploadPurpose;
  /** target id (transaction / pending expense / expense item); null for "bank" */
  t: string | null;
  /** id of the user who opened the dialog — receipts are always attributed here */
  u: string;
  /** nonce == receipt_upload_sessions.id */
  n: string;
  /** expiry, epoch seconds */
  x: number;
}

const PURPOSES: readonly UploadPurpose[] = ["txn", "pending", "bank", "item"];

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set — cannot sign receipt upload tokens");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(body).digest());
}

/** Default TTL 20 minutes. Returns `<payloadB64>.<sigB64>`. */
export function signUploadToken(
  input: Omit<UploadTokenPayload, "x">,
  ttlSeconds = 1200,
): string {
  const payload: UploadTokenPayload = {
    ...input,
    x: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

/** Returns the payload, or null for a malformed / forged / expired token. */
export function verifyUploadToken(token: string): UploadTokenPayload | null {
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as UploadTokenPayload;
    if (
      !payload ||
      typeof payload.u !== "string" ||
      typeof payload.n !== "string" ||
      typeof payload.x !== "number" ||
      !PURPOSES.includes(payload.p) ||
      (payload.t !== null && typeof payload.t !== "string")
    ) {
      return null;
    }
    if (payload.x * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
