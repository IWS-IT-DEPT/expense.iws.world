CREATE TABLE "entity_qbo_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"realm_id" text,
	"company_name" text,
	"environment" text DEFAULT 'sandbox' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"export_trigger" text DEFAULT 'manual' NOT NULL,
	"uses_classes" boolean DEFAULT true NOT NULL,
	"uses_locations" boolean DEFAULT true NOT NULL,
	"jobs_as" text DEFAULT 'project' NOT NULL,
	"card_account_qbo_id" text,
	"card_account_name" text,
	"ap_account_qbo_id" text,
	"ap_account_name" text,
	"default_vendor_qbo_id" text,
	"default_vendor_name" text,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid,
	CONSTRAINT "entity_qbo_settings_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
ALTER TABLE "entity_qbo_settings" ADD CONSTRAINT "entity_qbo_settings_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_qbo_settings" ADD CONSTRAINT "entity_qbo_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;