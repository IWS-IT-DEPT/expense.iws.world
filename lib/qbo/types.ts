/**
 * QuickBooks Online integration types. Each of the 6 entities connects to its
 * own QBO company file, so everything here is scoped by `entityId`.
 *
 * Dimension mapping:
 *   entity   -> which QBO company file (realm)
 *   location -> QBO Location
 *   unit     -> QBO Class
 *   job      -> QBO Project (under a Customer)
 *   category -> QBO Account (expense / COGS)
 *   cardholder     -> PrivateNote / memo (QBO has no employee dimension)
 *   card account   -> QBO bank/credit-card Account (AccountRef on a Purchase)
 *   reimbursements  -> QBO Bill, vendor = the employee
 */

export type QboDimType = "account" | "class" | "location" | "customer" | "project" | "vendor";

export interface QboDimensionRecord {
  qboId: string;
  name: string;
  fullyQualifiedName?: string;
  parentQboId?: string;
  accountType?: string;
  active: boolean;
}

/** Resolved QBO references for a single coded line. */
export interface QboLineCoding {
  accountRef: string; // category -> Account
  classRef?: string; // unit -> Class
  locationRef?: string; // location -> Location (QBO calls the field DepartmentRef)
  customerRef?: string; // job -> Customer / Project
  amount: number; // dollars
  description: string;
}

export interface QboPurchaseDraft {
  entityId: string;
  paymentType: "CreditCard";
  accountRef: string; // the credit-card liability account
  txnDate: string;
  entityRef?: { value: string; name: string }; // merchant as vendor, optional
  privateNote: string; // "Cardholder: Jane Doe · <business purpose>"
  lines: QboLineCoding[];
}

export interface QboBillDraft {
  entityId: string;
  vendorRef: string; // employee-as-vendor
  txnDate: string;
  privateNote: string;
  lines: QboLineCoding[];
}

export interface QboPushResult {
  ok: boolean;
  qboObjectId?: string;
  qboObjectType?: "Purchase" | "Bill" | "JournalEntry";
  error?: string;
  raw?: unknown;
}
