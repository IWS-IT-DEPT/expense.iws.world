CREATE TYPE "public"."card_approval_status" AS ENUM('approved', 'pending', 'rejected');--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "approval_status" "card_approval_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "requested_by_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;