CREATE TYPE "public"."pending_expense_status" AS ENUM('open', 'matched', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."receipt_upload_purpose" AS ENUM('txn', 'pending', 'bank', 'item');--> statement-breakpoint
CREATE TYPE "public"."receipt_upload_session_status" AS ENUM('pending', 'uploaded', 'expired');--> statement-breakpoint
CREATE TABLE "pending_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant" text NOT NULL,
	"merchant_normalized" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"purchase_date" date NOT NULL,
	"card_account_id" uuid,
	"notes" text,
	"coded" boolean DEFAULT false NOT NULL,
	"entity_id" uuid,
	"location_id" uuid,
	"unit_id" uuid,
	"job_id" uuid,
	"category_id" uuid,
	"business_purpose" text,
	"is_intercompany" boolean DEFAULT false NOT NULL,
	"status" "pending_expense_status" DEFAULT 'open' NOT NULL,
	"matched_transaction_id" uuid,
	"matched_by_id" uuid,
	"matched_at" timestamp with time zone,
	"auto_matched" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "receipt_upload_purpose" NOT NULL,
	"target_id" uuid,
	"user_id" uuid NOT NULL,
	"status" "receipt_upload_session_status" DEFAULT 'pending' NOT NULL,
	"receipt_count" integer DEFAULT 0 NOT NULL,
	"created_pending_expense_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "pending_expense_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_card_account_id_card_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."card_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_matched_by_id_users_id_fk" FOREIGN KEY ("matched_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_upload_sessions" ADD CONSTRAINT "receipt_upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_upload_sessions" ADD CONSTRAINT "receipt_upload_sessions_created_pending_expense_id_pending_expenses_id_fk" FOREIGN KEY ("created_pending_expense_id") REFERENCES "public"."pending_expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_user_status_idx" ON "pending_expenses" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "pending_match_idx" ON "pending_expenses" USING btree ("user_id","amount_cents","purchase_date");--> statement-breakpoint
CREATE INDEX "upload_session_user_idx" ON "receipt_upload_sessions" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_pending_expense_id_pending_expenses_id_fk" FOREIGN KEY ("pending_expense_id") REFERENCES "public"."pending_expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_pending_idx" ON "receipts" USING btree ("pending_expense_id");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipt_single_target" CHECK (num_nonnulls("receipts"."transaction_id", "receipts"."expense_item_id", "receipts"."pending_expense_id") <= 1);