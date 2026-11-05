ALTER TABLE "categories" ADD COLUMN "requires_job" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "requires_job_code" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "categories" ("code", "name", "description", "requires_job", "sort_order") VALUES ('JOB', 'Job / Project Expense', 'Costs for a specific job or project — requires a job code', true, 25) ON CONFLICT ("code") DO NOTHING;
