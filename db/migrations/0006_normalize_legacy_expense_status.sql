-- Receipt Bank test rows predate the new lifecycle and are stuck at the dead
-- 'open' / 'matched' statuses. Fold them into the cardholder flow as drafts.
UPDATE "pending_expenses" SET "status" = 'draft', "report_id" = NULL
WHERE "status" IN ('open', 'matched');
