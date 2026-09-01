/**
 * Database schema for the IWS group expense tracking system.
 *
 * Money is stored as integer cents everywhere (`amountCents`). Rates and mileage
 * that need fractional precision use `numeric` (returned as strings by Drizzle).
 *
 * Coding model: every card transaction gets one or more `allocations`. Each
 * allocation carries the full cost coding — entity, location, unit OR job,
 * category, business purpose. The card the charge landed on does NOT determine
 * the entity; a cardholder on the IWS Capital One card can buy for Rolling Green.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums -- */

export const cardIssuer = pgEnum("card_issuer", ["capital_one", "amex"]);
/** @deprecated card self-registration no longer needs approval. Kept so the DB
 *  type isn't dropped mid-migration; remove in a later cleanup. */
export const cardApprovalStatus = pgEnum("card_approval_status", [
  "approved",
  "pending",
  "rejected",
]);
/** Card network a cardholder-registered card runs on. */
export const cardNetwork = pgEnum("card_network", [
  "visa",
  "mastercard",
  "amex",
  "discover",
  "other",
]);
export const importProfile = pgEnum("import_profile", ["capital_one", "amex", "teller"]);
export const userRole = pgEnum("user_role", ["cardholder", "accounting", "approver", "admin"]);
export const unitType = pgEnum("unit_type", ["truck", "tractor", "trailer", "equipment", "other"]);
export const jobStatus = pgEnum("job_status", ["open", "closed"]);
/** Which extra coding dimension an entity requires on every allocation. */
export const costingMode = pgEnum("costing_mode", ["none", "unit", "job", "unit_or_job"]);
export const txnSource = pgEnum("txn_source", ["csv", "teller", "manual"]);
export const txnStatus = pgEnum("txn_status", [
  "unassigned", // imported, no cardholder matched
  "uncoded", // assigned to a cardholder, not yet coded
  "coded", // cardholder finished coding, not yet in a submitted report
  "submitted", // part of a submitted weekly report
  "in_review", // accounting reviewing
  "approved", // Allie approved
  "exported", // pushed to QuickBooks
  "rejected", // sent back to cardholder
]);
export const expenseKind = pgEnum("expense_kind", ["out_of_pocket", "mileage"]);
export const reportType = pgEnum("report_type", ["weekly"]);
export const reportStatus = pgEnum("report_status", [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "exported",
  "reconciled", // accounting has cross-checked every card line against the statement
]);
export const batchStatus = pgEnum("batch_status", ["open", "exported", "paid"]);
export const approvalSubject = pgEnum("approval_subject", [
  "transaction",
  "expense_report",
  "reimbursement_batch",
  "card_expense",
  "expense_item",
]);
export const approvalAction = pgEnum("approval_action", [
  "submit",
  "review",
  "request_changes",
  "approve",
  "reject",
  "reopen",
  "export",
]);
export const flagType = pgEnum("flag_type", [
  "missing_receipt",
  "uncategorized",
  "over_threshold",
  "new_merchant",
  "possible_duplicate",
  "intercompany",
  "split_mismatch",
  "policy",
]);
export const flagSeverity = pgEnum("flag_severity", ["info", "warn", "block"]);
export const qboDimType = pgEnum("qbo_dim_type", [
  "account",
  "class",
  "location",
  "customer",
  "project",
  "vendor",
]);
export const qboConnectionStatus = pgEnum("qbo_connection_status", [
  "disconnected",
  "connected",
  "error",
]);

/**
 * Card-expense lifecycle:
 *   draft → submitted → reconciled → approved   (or → rejected → draft again)
 * `open`/`matched` are dead (from the old import-matching model); `cancelled`
 * means a submitted line the cardholder later voided.
 */
export const pendingExpenseStatus = pgEnum("pending_expense_status", [
  "open",
  "matched",
  "cancelled",
  "draft",
  "submitted",
  "reconciled",
  "approved",
  "rejected",
]);
/** What a receipt-upload link/session is attaching to. */
export const receiptUploadPurpose = pgEnum("receipt_upload_purpose", [
  "txn",
  "pending",
  "bank",
  "item",
]);
export const receiptUploadSessionStatus = pgEnum("receipt_upload_session_status", [
  "pending",
  "uploaded",
  "expired",
]);

/* ---------------------------------------------------------- dimension data -- */

/** The 6 sister companies. Each maps to its own QuickBooks Online company file. */
export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // IWS, PRE, PORT, RGT, RGL, GGB
  name: text("name").notNull(),
  legalName: text("legal_name"),
  /** Drives which extra field the coding wizard forces (unit vs job). */
  costingMode: costingMode("costing_mode").notNull().default("none"),
  /** Hex accent for entity badges in the UI. */
  brandColor: text("brand_color"),
  /** Path under /public to the entity logo, e.g. /brand/rgt.png */
  logoPath: text("logo_path"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Physical sites. One global list; `homeEntityId` is the entity a site belongs
 * to, but ANY entity may select ANY location (e.g. Rolling Green working out of
 * the IWS Main Office). The picker just surfaces the home entity's sites first.
 */
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  homeEntityId: uuid("home_entity_id").references(() => entities.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fleet assets / equipment. Used by Rolling Green, Port City, Gravel Grabbers. */
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    unitNumber: text("unit_number").notNull(), // hand-entered, e.g. "Truck 07"
    description: text("description"),
    type: unitType("type").notNull().default("other"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.entityId, t.unitNumber)],
);

/** Jobs for Precision Construction Repair (and any other job-costed entity). */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    jobNumber: text("job_number").notNull(), // hand-entered
    name: text("name"),
    customerName: text("customer_name"),
    status: jobStatus("status").notNull().default("open"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.entityId, t.jobNumber)],
);

/**
 * Expense categories the cardholder picks. Category -> QuickBooks GL account is
 * resolved per entity through `dimensionMappings` (each QBO file has its own
 * chart of accounts).
 */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** When true, a job OR unit must be supplied on the allocation. */
  requiresJobOrUnit: boolean("requires_job_or_unit").notNull().default(false),
  receiptAlwaysRequired: boolean("receipt_always_required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Learned merchant list — powers the "new merchant" flag and default coding. */
export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  normalizedName: text("normalized_name").notNull().unique(),
  displayName: text("display_name"),
  defaultCategoryId: uuid("default_category_id").references(() => categories.id),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  txnCount: integer("txn_count").notNull().default(0),
});

/* -------------------------------------------------------------- people ------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  entraOid: text("entra_oid").unique(), // Microsoft Entra object id, set on first login
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("cardholder"),
  homeEntityId: uuid("home_entity_id").references(() => entities.id),
  homeLocationId: uuid("home_location_id").references(() => locations.id),
  mileageEligible: boolean("mileage_eligible").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- card data ---- */

/** The 3 card programs. `owningEntityId` is the default entity + who pays the bill. */
export const cardAccounts = pgTable("card_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  issuer: cardIssuer("issuer").notNull(),
  importProfile: importProfile("import_profile").notNull(),
  owningEntityId: uuid("owning_entity_id")
    .notNull()
    .references(() => entities.id),
  lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A card a cardholder carries. They self-register it (`network` + `last4` +
 * `displayName` nickname); no admin approval. `cardAccountId` is an optional
 * back-reference to a real card program (admin-managed, feeds QBO later).
 */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardAccountId: uuid("card_account_id").references(() => cardAccounts.id),
    userId: uuid("user_id").references(() => users.id),
    network: cardNetwork("network"),
    last4: text("last4").notNull(),
    displayName: text("display_name"), // cardholder's nickname for the card
    /** @deprecated removed in the cleanup migration */
    approvalStatus: cardApprovalStatus("approval_status").notNull().default("approved"),
    /** @deprecated removed in the cleanup migration */
    requestedById: uuid("requested_by_id").references(() => users.id),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("cards_card_account_id_last4_unique").on(t.cardAccountId, t.last4),
    unique("cards_user_id_last4_unique").on(t.userId, t.last4),
  ],
);

export const statementPeriods = pgTable(
  "statement_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardAccountId: uuid("card_account_id")
      .notNull()
      .references(() => cardAccounts.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    statementDate: date("statement_date"),
    closed: boolean("closed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.cardAccountId, t.endDate)],
);

/* ---------------------------------------------------------- transactions ---- */

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardAccountId: uuid("card_account_id")
      .notNull()
      .references(() => cardAccounts.id),
    cardId: uuid("card_id").references(() => cards.id),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    reportId: uuid("report_id").references(() => expenseReports.id),

    txnDate: date("txn_date").notNull(),
    postDate: date("post_date"),
    /** Positive = charge/expense, negative = credit/refund. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),

    merchantRaw: text("merchant_raw").notNull(),
    merchantNormalized: text("merchant_normalized"),
    descriptionRaw: text("description_raw"),
    mcc: text("mcc"),

    source: txnSource("source").notNull(),
    /** Stable id from the source, used for idempotent import. */
    externalId: text("external_id").notNull(),
    statementPeriodId: uuid("statement_period_id").references(() => statementPeriods.id),

    status: txnStatus("status").notNull().default("unassigned"),
    notes: text("notes"),

    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    importedById: uuid("imported_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.cardAccountId, t.externalId),
    index("txn_assigned_status_idx").on(t.assignedUserId, t.status),
    index("txn_date_idx").on(t.txnDate),
  ],
);

/**
 * Cost coding. One row per transaction normally; multiple rows split a single
 * charge across entities / jobs / units. `amountCents` across a transaction's
 * allocations must equal the transaction amount (enforced in app + `split_mismatch` flag).
 */
export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),

    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    unitId: uuid("unit_id").references(() => units.id),
    jobId: uuid("job_id").references(() => jobs.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    businessPurpose: text("business_purpose").notNull(),

    /** entity differs from the card account's owning entity. */
    isIntercompany: boolean("is_intercompany").notNull().default(false),

    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alloc_txn_idx").on(t.transactionId)],
);

/* ------------------------------------------------- reimbursable expenses ---- */

/** Weekly report — the mandatory bundle a cardholder submits every week. */
export const expenseReports = pgTable(
  "expense_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: reportType("type").notNull().default("weekly"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: reportStatus("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedById: uuid("reviewed_by_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedById: uuid("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.periodStart)],
);

/**
 * Out-of-pocket and mileage line items. Same coding shape as `allocations`.
 * Reimbursed through payroll via `reimbursementBatches`.
 */
export const expenseItems = pgTable(
  "expense_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").references(() => expenseReports.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: expenseKind("kind").notNull(),
    itemDate: date("item_date").notNull(),
    amountCents: integer("amount_cents").notNull(), // computed for mileage

    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    unitId: uuid("unit_id").references(() => units.id),
    jobId: uuid("job_id").references(() => jobs.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    businessPurpose: text("business_purpose").notNull(),
    isIntercompany: boolean("is_intercompany").notNull().default(false),

    // out_of_pocket only
    paymentMethod: text("payment_method"), // personal_card | cash | personal_check

    // mileage only
    miles: numeric("miles", { precision: 8, scale: 1 }),
    mileageRateId: uuid("mileage_rate_id").references(() => mileageRates.id),
    tripFrom: text("trip_from"),
    tripTo: text("trip_to"),

    reimbursementBatchId: uuid("reimbursement_batch_id").references(() => reimbursementBatches.id),
    status: reportStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("item_user_status_idx").on(t.userId, t.status)],
);

/** IRS standard mileage rate history. Newest effective row wins for a given date. */
export const mileageRates = pgTable("mileage_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  effectiveDate: date("effective_date").notNull().unique(),
  /** US dollars per mile, e.g. 0.7000. */
  ratePerMile: numeric("rate_per_mile", { precision: 6, scale: 4 }).notNull(),
  source: text("source").notNull().default("IRS"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reimbursementBatches = pgTable("reimbursement_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  payPeriodStart: date("pay_period_start"),
  payPeriodEnd: date("pay_period_end"),
  status: batchStatus("status").notNull().default("open"),
  payrollReference: text("payroll_reference"),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  exportedById: uuid("exported_by_id").references(() => users.id),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------------- receipts --- */

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // At most one of these is set. A receipt with all three null lives in the
    // user's Receipt Bank via `pendingExpenseId`; a bare bank receipt always has
    // a `pendingExpenses` row, so in practice one is always set.
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    expenseItemId: uuid("expense_item_id").references(() => expenseItems.id, { onDelete: "cascade" }),
    pendingExpenseId: uuid("pending_expense_id").references(() => pendingExpenses.id, {
      onDelete: "cascade",
    }),
    blobKey: text("blob_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    ocrText: text("ocr_text"),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("receipt_txn_idx").on(t.transactionId),
    index("receipt_item_idx").on(t.expenseItemId),
    index("receipt_pending_idx").on(t.pendingExpenseId),
    check(
      "receipt_single_target",
      sql`num_nonnulls(${t.transactionId}, ${t.expenseItemId}, ${t.pendingExpenseId}) <= 1`,
    ),
  ],
);

/* --------------------------------------------------------- card expenses --- */

/**
 * A card purchase a cardholder enters themselves — merchant, amount, date, which
 * of their `cards` it was on, the full cost coding, and a receipt. Flows
 *   draft → submitted (in a weekly report) → reconciled (accounting confirmed it
 *   against the real statement, optionally correcting the amount/date) →
 *   approved (approver locked the report).
 *
 * Table name is historical ("pending_expenses"); the receipt-upload plumbing
 * keys off it. Coding columns mirror `allocations`, nullable until submit.
 */
export const pendingExpenses = pgTable(
  "pending_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    merchant: text("merchant").notNull(),
    merchantNormalized: text("merchant_normalized").notNull(),
    amountCents: integer("amount_cents").notNull(), // what the cardholder entered
    purchaseDate: date("purchase_date").notNull(),
    cardId: uuid("card_id").references(() => cards.id), // required at submit
    notes: text("notes"),
    /** @deprecated dead columns from the old import-matching model; unused */
    cardAccountId: uuid("card_account_id").references(() => cardAccounts.id),
    coded: boolean("coded").notNull().default(false),

    // coding (nullable until submit; completeness is a computed check)
    entityId: uuid("entity_id").references(() => entities.id),
    locationId: uuid("location_id").references(() => locations.id),
    unitId: uuid("unit_id").references(() => units.id),
    jobId: uuid("job_id").references(() => jobs.id),
    categoryId: uuid("category_id").references(() => categories.id),
    businessPurpose: text("business_purpose"),
    isIntercompany: boolean("is_intercompany").notNull().default(false),

    status: pendingExpenseStatus("status").notNull().default("open"),
    reportId: uuid("report_id").references(() => expenseReports.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),

    // accounting reconciliation (nulls until reconciled)
    actualAmountCents: integer("actual_amount_cents"),
    actualPurchaseDate: date("actual_purchase_date"),
    reconciledById: uuid("reconciled_by_id").references(() => users.id),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconcileNote: text("reconcile_note"),

    approvedById: uuid("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    /** @deprecated dead columns from the old import-matching model; unused */
    matchedTransactionId: uuid("matched_transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    matchedById: uuid("matched_by_id").references(() => users.id),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    autoMatched: boolean("auto_matched").notNull().default(false),

    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pending_user_status_idx").on(t.userId, t.status),
    index("pending_match_idx").on(t.userId, t.amountCents, t.purchaseDate),
    index("pending_report_idx").on(t.reportId),
  ],
);

/**
 * One row per "Upload Receipt" dialog opened on a desktop. Backs the QR
 * desktop→phone handoff: `id` is the token nonce, and the desktop polls this
 * row's `status` while the phone uploads.
 */
export const receiptUploadSessions = pgTable(
  "receipt_upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(), // == token nonce
    purpose: receiptUploadPurpose("purpose").notNull(),
    targetId: uuid("target_id"), // null for "bank"
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: receiptUploadSessionStatus("status").notNull().default("pending"),
    receiptCount: integer("receipt_count").notNull().default(0),
    createdPendingExpenseId: uuid("created_pending_expense_id").references(
      () => pendingExpenses.id,
      { onDelete: "set null" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("upload_session_user_idx").on(t.userId, t.status)],
);

/** Idempotency ledger for the weekly-report email reminder cron. */
export const reminderSends = pgTable(
  "reminder_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    periodStart: date("period_start").notNull(),
    slot: text("slot").notNull(), // 'wed_am' | 'fri_am' | 'fri_pm'
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.periodStart, t.slot)],
);

/* --------------------------------------------------- workflow + exceptions -- */

/** Immutable audit trail of every workflow action. */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectType: approvalSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    action: approvalAction("action").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approval_subject_idx").on(t.subjectType, t.subjectId)],
);

/**
 * Exception flags drive Allie's approve-by-exception queue. Clean items with no
 * unresolved flags can be batch-approved; flagged items surface individually.
 */
export const exceptionFlags = pgTable(
  "exception_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    expenseItemId: uuid("expense_item_id").references(() => expenseItems.id, { onDelete: "cascade" }),
    type: flagType("type").notNull(),
    severity: flagSeverity("severity").notNull().default("warn"),
    detail: text("detail"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flag_txn_idx").on(t.transactionId),
    index("flag_open_idx").on(t.resolved),
  ],
);

/** Tunable policy: receipt thresholds, auto-approve rules, etc. */
export const policySettings = pgTable("policy_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedById: uuid("updated_by_id").references(() => users.id),
});

/**
 * Server-side error log surfaced in the IT Admin dashboard. Written by
 * `instrumentation.ts` (`onRequestError`) and `lib/log-error.ts`. No FK to
 * `users` — an error can happen before (or without) an authenticated user.
 * Rows are grouped by `fingerprint` in the UI; "resolve" stamps every row
 * sharing a fingerprint.
 */
export const errorLogs = pgTable(
  "error_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprint: text("fingerprint").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    digest: text("digest"),
    path: text("path"),
    method: text("method"),
    /** 'render' | 'route' | 'action' | 'proxy' | 'manual' */
    source: text("source"),
    routePath: text("route_path"),
    userEmail: text("user_email"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("error_log_created_idx").on(t.createdAt),
    index("error_log_fingerprint_idx").on(t.fingerprint),
  ],
);

/* ----------------------------------------------------- QuickBooks Online ---- */

/** One OAuth connection per entity (6 separate QBO company files). */
export const qboConnections = pgTable("qbo_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id")
    .notNull()
    .unique()
    .references(() => entities.id),
  realmId: text("realm_id").notNull(),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  status: qboConnectionStatus("status").notNull().default("disconnected"),
  lastError: text("last_error"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  connectedById: uuid("connected_by_id").references(() => users.id),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
});

/** Cached lists pulled from each QBO file (accounts, classes, locations, ...). */
export const qboDimensions = pgTable(
  "qbo_dimensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    dimType: qboDimType("dim_type").notNull(),
    qboId: text("qbo_id").notNull(),
    name: text("name").notNull(),
    fullyQualifiedName: text("fully_qualified_name"),
    parentQboId: text("parent_qbo_id"),
    accountType: text("account_type"),
    active: boolean("active").notNull().default(true),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.entityId, t.dimType, t.qboId)],
);

/**
 * Maps a local dimension row to a QBO id, per entity. A location like
 * "Main Office" resolves to a different QBO Location id in each company file.
 */
export const dimensionMappings = pgTable(
  "dimension_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id),
    localType: text("local_type").notNull(), // location | unit | job | category
    localId: uuid("local_id").notNull(),
    qboDimType: qboDimType("qbo_dim_type").notNull(),
    qboId: text("qbo_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.entityId, t.localType, t.localId)],
);

/** Record of every push to QuickBooks (Purchase / Bill / JournalEntry). */
export const qboExports = pgTable("qbo_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entities.id),
  subjectType: text("subject_type").notNull(), // transaction | expense_item | reimbursement_batch
  subjectId: uuid("subject_id").notNull(),
  qboObjectType: text("qbo_object_type"), // Purchase | Bill | JournalEntry
  qboObjectId: text("qbo_object_id"),
  status: text("status").notNull().default("pending"), // pending | success | error
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  error: text("error"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------- relations --- */

export const entitiesRelations = relations(entities, ({ many, one }) => ({
  locations: many(locations),
  units: many(units),
  jobs: many(jobs),
  cardAccounts: many(cardAccounts),
  qboConnection: one(qboConnections),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  homeEntity: one(entities, { fields: [locations.homeEntityId], references: [entities.id] }),
}));

export const unitsRelations = relations(units, ({ one }) => ({
  entity: one(entities, { fields: [units.entityId], references: [entities.id] }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  entity: one(entities, { fields: [jobs.entityId], references: [entities.id] }),
}));

export const qboConnectionsRelations = relations(qboConnections, ({ one }) => ({
  entity: one(entities, { fields: [qboConnections.entityId], references: [entities.id] }),
}));

export const exceptionFlagsRelations = relations(exceptionFlags, ({ one }) => ({
  transaction: one(transactions, {
    fields: [exceptionFlags.transactionId],
    references: [transactions.id],
  }),
  expenseItem: one(expenseItems, {
    fields: [exceptionFlags.expenseItemId],
    references: [expenseItems.id],
  }),
  resolvedBy: one(users, { fields: [exceptionFlags.resolvedById], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  homeEntity: one(entities, { fields: [users.homeEntityId], references: [entities.id] }),
  homeLocation: one(locations, { fields: [users.homeLocationId], references: [locations.id] }),
  cards: many(cards),
  assignedTransactions: many(transactions),
  reports: many(expenseReports),
  pendingExpenses: many(pendingExpenses),
}));

export const cardAccountsRelations = relations(cardAccounts, ({ many, one }) => ({
  owningEntity: one(entities, {
    fields: [cardAccounts.owningEntityId],
    references: [entities.id],
  }),
  cards: many(cards),
  transactions: many(transactions),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
  cardAccount: one(cardAccounts, { fields: [cards.cardAccountId], references: [cardAccounts.id] }),
  user: one(users, { fields: [cards.userId], references: [users.id] }),
  transactions: many(transactions),
  cardExpenses: many(pendingExpenses),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  cardAccount: one(cardAccounts, {
    fields: [transactions.cardAccountId],
    references: [cardAccounts.id],
  }),
  card: one(cards, { fields: [transactions.cardId], references: [cards.id] }),
  assignedUser: one(users, { fields: [transactions.assignedUserId], references: [users.id] }),
  report: one(expenseReports, { fields: [transactions.reportId], references: [expenseReports.id] }),
  allocations: many(allocations),
  receipts: many(receipts),
  flags: many(exceptionFlags),
}));

export const allocationsRelations = relations(allocations, ({ one }) => ({
  transaction: one(transactions, {
    fields: [allocations.transactionId],
    references: [transactions.id],
  }),
  entity: one(entities, { fields: [allocations.entityId], references: [entities.id] }),
  location: one(locations, { fields: [allocations.locationId], references: [locations.id] }),
  unit: one(units, { fields: [allocations.unitId], references: [units.id] }),
  job: one(jobs, { fields: [allocations.jobId], references: [jobs.id] }),
  category: one(categories, { fields: [allocations.categoryId], references: [categories.id] }),
}));

export const expenseReportsRelations = relations(expenseReports, ({ one, many }) => ({
  user: one(users, { fields: [expenseReports.userId], references: [users.id] }),
  transactions: many(transactions),
  items: many(expenseItems),
  cardExpenses: many(pendingExpenses),
}));

export const expenseItemsRelations = relations(expenseItems, ({ one, many }) => ({
  report: one(expenseReports, { fields: [expenseItems.reportId], references: [expenseReports.id] }),
  user: one(users, { fields: [expenseItems.userId], references: [users.id] }),
  entity: one(entities, { fields: [expenseItems.entityId], references: [entities.id] }),
  location: one(locations, { fields: [expenseItems.locationId], references: [locations.id] }),
  unit: one(units, { fields: [expenseItems.unitId], references: [units.id] }),
  job: one(jobs, { fields: [expenseItems.jobId], references: [jobs.id] }),
  category: one(categories, { fields: [expenseItems.categoryId], references: [categories.id] }),
  mileageRate: one(mileageRates, {
    fields: [expenseItems.mileageRateId],
    references: [mileageRates.id],
  }),
  batch: one(reimbursementBatches, {
    fields: [expenseItems.reimbursementBatchId],
    references: [reimbursementBatches.id],
  }),
  receipts: many(receipts),
  flags: many(exceptionFlags),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  transaction: one(transactions, {
    fields: [receipts.transactionId],
    references: [transactions.id],
  }),
  expenseItem: one(expenseItems, {
    fields: [receipts.expenseItemId],
    references: [expenseItems.id],
  }),
  pendingExpense: one(pendingExpenses, {
    fields: [receipts.pendingExpenseId],
    references: [pendingExpenses.id],
  }),
}));

export const pendingExpensesRelations = relations(pendingExpenses, ({ one, many }) => ({
  user: one(users, { fields: [pendingExpenses.userId], references: [users.id] }),
  card: one(cards, { fields: [pendingExpenses.cardId], references: [cards.id] }),
  report: one(expenseReports, {
    fields: [pendingExpenses.reportId],
    references: [expenseReports.id],
  }),
  entity: one(entities, { fields: [pendingExpenses.entityId], references: [entities.id] }),
  location: one(locations, { fields: [pendingExpenses.locationId], references: [locations.id] }),
  unit: one(units, { fields: [pendingExpenses.unitId], references: [units.id] }),
  job: one(jobs, { fields: [pendingExpenses.jobId], references: [jobs.id] }),
  category: one(categories, { fields: [pendingExpenses.categoryId], references: [categories.id] }),
  receipts: many(receipts),
}));

export const receiptUploadSessionsRelations = relations(receiptUploadSessions, ({ one }) => ({
  user: one(users, { fields: [receiptUploadSessions.userId], references: [users.id] }),
  createdPendingExpense: one(pendingExpenses, {
    fields: [receiptUploadSessions.createdPendingExpenseId],
    references: [pendingExpenses.id],
  }),
}));

export const reminderSendsRelations = relations(reminderSends, ({ one }) => ({
  user: one(users, { fields: [reminderSends.userId], references: [users.id] }),
}));
