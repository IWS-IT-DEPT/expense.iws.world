import { eq } from "drizzle-orm";

import { db } from "@/db";
import { qboConnections } from "@/db/schema";

import type { QboBillDraft, QboPurchaseDraft, QboPushResult } from "./types";

/**
 * QuickBooks Online client — Phase 2 work. The OAuth 2.0 flow, token refresh and
 * the `/v3/company/{realmId}/purchase` calls are stubbed here behind a stable
 * surface so the export pipeline and UI can be built against it now.
 *
 * Implementation checklist (see README "QuickBooks Online"):
 *  - OAuth: Intuit app, 6 authorization grants (one per entity), store realmId
 *    + encrypted tokens in `qbo_connections`.
 *  - Refresh access token (1h life) and rotate refresh token (100d life).
 *  - Sync Account/Class/Location/Customer/Vendor lists into `qbo_dimensions`.
 *  - POST Purchase for card charges, Bill for reimbursements.
 *  - Record every attempt in `qbo_exports`.
 */

const QBO_BASE =
  process.env.QBO_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

export async function getConnection(entityId: string) {
  return db.query.qboConnections.findFirst({
    where: eq(qboConnections.entityId, entityId),
  });
}

export function authorizeUrl(entityId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID ?? "",
    redirect_uri: `${process.env.APP_URL}/api/qbo/callback`,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state: `${entityId}:${state}`,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

async function accessTokenFor(entityId: string): Promise<string> {
  const conn = await getConnection(entityId);
  if (!conn || conn.status !== "connected") {
    throw new Error(`QuickBooks is not connected for entity ${entityId}.`);
  }
  // TODO: decrypt conn.accessTokenEnc, refresh if expired, persist rotation.
  throw new Error("QBO token exchange not implemented yet (Phase 2).");
}

export async function pushPurchase(draft: QboPurchaseDraft): Promise<QboPushResult> {
  try {
    const token = await accessTokenFor(draft.entityId);
    const conn = await getConnection(draft.entityId);
    const res = await fetch(
      `${QBO_BASE}/v3/company/${conn!.realmId}/purchase?minorversion=73`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPurchaseBody(draft)),
      },
    );
    const raw = await res.json();
    if (!res.ok) return { ok: false, error: JSON.stringify(raw), raw };
    return { ok: true, qboObjectId: raw.Purchase?.Id, qboObjectType: "Purchase", raw };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pushBill(draft: QboBillDraft): Promise<QboPushResult> {
  void draft;
  return { ok: false, error: "pushBill not implemented yet (Phase 2)." };
}

function buildPurchaseBody(draft: QboPurchaseDraft) {
  return {
    PaymentType: draft.paymentType,
    AccountRef: { value: draft.accountRef },
    TxnDate: draft.txnDate,
    PrivateNote: draft.privateNote,
    Line: draft.lines.map((line) => ({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: line.amount,
      Description: line.description,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: line.accountRef },
        ...(line.classRef ? { ClassRef: { value: line.classRef } } : {}),
        ...(line.locationRef ? { DepartmentRef: { value: line.locationRef } } : {}),
        ...(line.customerRef ? { CustomerRef: { value: line.customerRef } } : {}),
      },
    })),
  };
}
