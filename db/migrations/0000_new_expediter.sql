CREATE TYPE "public"."approval_action" AS ENUM('submit', 'review', 'request_changes', 'approve', 'reject', 'reopen', 'export');--> statement-breakpoint
CREATE TYPE "public"."approval_subject" AS ENUM('transaction', 'expense_report', 'reimbursement_batch');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('open', 'exported', 'paid');--> statement-breakpoint
CREATE TYPE "public"."card_issuer" AS ENUM('capital_one', 'amex');--> statement-breakpoint
CREATE TYPE "public"."costing_mode" AS ENUM('none', 'unit', 'job', 'unit_or_job');--> statement-breakpoint
CREATE TYPE "public"."expense_kind" AS ENUM('out_of_pocket', 'mileage');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('info', 'warn', 'block');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('missing_receipt', 'uncategorized', 'over_threshold', 'new_merchant', 'possible_duplicate', 'intercompany', 'split_mismatch', 'policy');--> statement-breakpoint
CREATE TYPE "public"."import_profile" AS ENUM('capital_one', 'amex', 'teller');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."qbo_connection_status" AS ENUM('disconnected', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."qbo_dim_type" AS ENUM('account', 'class', 'location', 'customer', 'project', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'submitted', 'in_review', 'approved', 'rejected', 'exported');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('weekly');--> statement-breakpoint
CREATE TYPE "public"."txn_source" AS ENUM('csv', 'teller', 'manual');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('unassigned', 'uncoded', 'coded', 'submitted', 'in_review', 'approved', 'exported', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('truck', 'tractor', 'trailer', 'equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('cardholder', 'accounting', 'approver', 'admin');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"entity_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"unit_id" uuid,
	"job_id" uuid,
	"category_id" uuid NOT NULL,
	"business_purpose" text NOT NULL,
	"is_intercompany" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "approval_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"action" "approval_action" NOT NULL,
	"actor_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"issuer" "card_issuer" NOT NULL,
	"import_profile" "import_profile" NOT NULL,
	"owning_entity_id" uuid NOT NULL,
	"last_imported_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_account_id" uuid NOT NULL,
	"user_id" uuid,
	"last4" text NOT NULL,
	"display_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_card_account_id_last4_unique" UNIQUE("card_account_id","last4")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"requires_job_or_unit" boolean DEFAULT false NOT NULL,
	"receipt_always_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "dimension_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"local_type" text NOT NULL,
	"local_id" uuid NOT NULL,
	"qbo_dim_type" "qbo_dim_type" NOT NULL,
	"qbo_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dimension_mappings_entity_id_local_type_local_id_unique" UNIQUE("entity_id","local_type","local_id")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"costing_mode" "costing_mode" DEFAULT 'none' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exception_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"expense_item_id" uuid,
	"type" "flag_type" NOT NULL,
	"severity" "flag_severity" DEFAULT 'warn' NOT NULL,
	"detail" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" "expense_kind" NOT NULL,
	"item_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"entity_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"unit_id" uuid,
	"job_id" uuid,
	"category_id" uuid NOT NULL,
	"business_purpose" text NOT NULL,
	"is_intercompany" boolean DEFAULT false NOT NULL,
	"payment_method" text,
	"miles" numeric(8, 1),
	"mileage_rate_id" uuid,
	"trip_from" text,
	"trip_to" text,
	"reimbursement_batch_id" uuid,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "report_type" DEFAULT 'weekly' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_by_id" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_reports_user_id_period_start_unique" UNIQUE("user_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"job_number" text NOT NULL,
	"name" text,
	"customer_name" text,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_entity_id_job_number_unique" UNIQUE("entity_id","job_number")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"home_entity_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_name" text NOT NULL,
	"display_name" text,
	"default_category_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"txn_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "merchants_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "mileage_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_date" date NOT NULL,
	"rate_per_mile" numeric(6, 4) NOT NULL,
	"source" text DEFAULT 'IRS' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mileage_rates_effective_date_unique" UNIQUE("effective_date")
);
--> statement-breakpoint
CREATE TABLE "policy_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "qbo_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"realm_id" text NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"status" "qbo_connection_status" DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"connected_by_id" uuid,
	"connected_at" timestamp with time zone,
	CONSTRAINT "qbo_connections_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
CREATE TABLE "qbo_dimensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"dim_type" "qbo_dim_type" NOT NULL,
	"qbo_id" text NOT NULL,
	"name" text NOT NULL,
	"fully_qualified_name" text,
	"parent_qbo_id" text,
	"account_type" text,
	"active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qbo_dimensions_entity_id_dim_type_qbo_id_unique" UNIQUE("entity_id","dim_type","qbo_id")
);
--> statement-breakpoint
CREATE TABLE "qbo_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"qbo_object_type" text,
	"qbo_object_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"expense_item_id" uuid,
	"blob_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"ocr_text" text,
	"uploaded_by_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"pay_period_start" date,
	"pay_period_end" date,
	"status" "batch_status" DEFAULT 'open' NOT NULL,
	"payroll_reference" text,
	"exported_at" timestamp with time zone,
	"exported_by_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_account_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"statement_date" date,
	"closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statement_periods_card_account_id_end_date_unique" UNIQUE("card_account_id","end_date")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_account_id" uuid NOT NULL,
	"card_id" uuid,
	"assigned_user_id" uuid,
	"report_id" uuid,
	"txn_date" date NOT NULL,
	"post_date" date,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"merchant_raw" text NOT NULL,
	"merchant_normalized" text,
	"description_raw" text,
	"mcc" text,
	"source" "txn_source" NOT NULL,
	"external_id" text NOT NULL,
	"statement_period_id" uuid,
	"status" "txn_status" DEFAULT 'unassigned' NOT NULL,
	"notes" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_card_account_id_external_id_unique" UNIQUE("card_account_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"unit_number" text NOT NULL,
	"description" text,
	"type" "unit_type" DEFAULT 'other' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_entity_id_unit_number_unique" UNIQUE("entity_id","unit_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entra_oid" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'cardholder' NOT NULL,
	"home_entity_id" uuid,
	"home_location_id" uuid,
	"mileage_eligible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_oid_unique" UNIQUE("entra_oid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_accounts" ADD CONSTRAINT "card_accounts_owning_entity_id_entities_id_fk" FOREIGN KEY ("owning_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_mappings" ADD CONSTRAINT "dimension_mappings_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_flags" ADD CONSTRAINT "exception_flags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_flags" ADD CONSTRAINT "exception_flags_expense_item_id_expense_items_id_fk" FOREIGN KEY ("expense_item_id") REFERENCES "public"."expense_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exception_flags" ADD CONSTRAINT "exception_flags_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_mileage_rate_id_mileage_rates_id_fk" FOREIGN KEY ("mileage_rate_id") REFERENCES "public"."mileage_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_reimbursement_batch_id_reimbursement_batches_id_fk" FOREIGN KEY ("reimbursement_batch_id") REFERENCES "public"."reimbursement_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_home_entity_id_entities_id_fk" FOREIGN KEY ("home_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_default_category_id_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qbo_connections" ADD CONSTRAINT "qbo_connections_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qbo_dimensions" ADD CONSTRAINT "qbo_dimensions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qbo_exports" ADD CONSTRAINT "qbo_exports_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qbo_exports" ADD CONSTRAINT "qbo_exports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_expense_item_id_expense_items_id_fk" FOREIGN KEY ("expense_item_id") REFERENCES "public"."expense_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_exported_by_id_users_id_fk" FOREIGN KEY ("exported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_periods" ADD CONSTRAINT "statement_periods_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_period_id_statement_periods_id_fk" FOREIGN KEY ("statement_period_id") REFERENCES "public"."statement_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_home_entity_id_entities_id_fk" FOREIGN KEY ("home_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_home_location_id_locations_id_fk" FOREIGN KEY ("home_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alloc_txn_idx" ON "allocations" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "approval_subject_idx" ON "approvals" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "flag_txn_idx" ON "exception_flags" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "flag_open_idx" ON "exception_flags" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "item_user_status_idx" ON "expense_items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "receipt_txn_idx" ON "receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "receipt_item_idx" ON "receipts" USING btree ("expense_item_id");--> statement-breakpoint
CREATE INDEX "txn_assigned_status_idx" ON "transactions" USING btree ("assigned_user_id","status");--> statement-breakpoint
CREATE INDEX "txn_date_idx" ON "transactions" USING btree ("txn_date");