CREATE TYPE "public"."card_network" AS ENUM('visa', 'mastercard', 'amex', 'discover', 'other');--> statement-breakpoint
ALTER TYPE "public"."approval_subject" ADD VALUE 'card_expense';--> statement-breakpoint
ALTER TYPE "public"."approval_subject" ADD VALUE 'expense_item';--> statement-breakpoint
ALTER TYPE "public"."pending_expense_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TYPE "public"."pending_expense_status" ADD VALUE 'submitted';--> statement-breakpoint
ALTER TYPE "public"."pending_expense_status" ADD VALUE 'reconciled';--> statement-breakpoint
ALTER TYPE "public"."pending_expense_status" ADD VALUE 'approved';--> statement-breakpoint
ALTER TYPE "public"."pending_expense_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."report_status" ADD VALUE 'reconciled';--> statement-breakpoint
CREATE TABLE "reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"slot" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sends_user_id_period_start_slot_unique" UNIQUE("user_id","period_start","slot")
);
--> statement-breakpoint
ALTER TABLE "cards" ALTER COLUMN "card_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "network" "card_network";--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "actual_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "actual_purchase_date" date;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "reconciled_by_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "reconcile_note" text;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "approved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_reconciled_by_id_users_id_fk" FOREIGN KEY ("reconciled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_expenses" ADD CONSTRAINT "pending_expenses_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_report_idx" ON "pending_expenses" USING btree ("report_id");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_last4_unique" UNIQUE("user_id","last4");