CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"digest" text,
	"path" text,
	"method" text,
	"source" text,
	"route_path" text,
	"user_email" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "error_log_created_idx" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_log_fingerprint_idx" ON "error_logs" USING btree ("fingerprint");