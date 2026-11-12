ALTER TABLE "expense_items" ADD COLUMN "bamboo_row_id" text;--> statement-breakpoint
ALTER TABLE "expense_items" ADD COLUMN "bamboo_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expense_items" ADD COLUMN "bamboo_sync_error" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "bamboo_file_id" text;