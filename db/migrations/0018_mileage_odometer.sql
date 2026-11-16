ALTER TABLE "expense_items" ADD COLUMN "odometer_start" numeric(9, 1);--> statement-breakpoint
ALTER TABLE "expense_items" ADD COLUMN "odometer_end" numeric(9, 1);--> statement-breakpoint
ALTER TABLE "expense_items" ADD COLUMN "personal_miles" numeric(8, 1);--> statement-breakpoint
ALTER TABLE "expense_items" ADD COLUMN "personal_miles_note" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "odometer_start" numeric(9, 1);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "started_from" text;--> statement-breakpoint
-- GPS trips in progress have no odometer reading; close them so the new flow starts clean.
UPDATE "trips" SET "status" = 'cancelled', "ended_at" = now() WHERE "status" = 'active';
