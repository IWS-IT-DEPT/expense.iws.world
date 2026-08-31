-- Mileage entry needs a category to default to. Idempotent.
INSERT INTO "categories" ("code", "name", "sort_order", "receipt_always_required")
VALUES ('MILEAGE', 'Mileage', 200, false)
ON CONFLICT ("code") DO NOTHING;
