-- Add shipping state machine + buyer-selected shipping option fields.
-- Safe for existing databases: columns are added only if they do not already exist.

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "shipping_stage" TEXT NOT NULL DEFAULT 'ADDRESS_MISSING',
ADD COLUMN IF NOT EXISTS "shipping_option_rate_id" TEXT,
ADD COLUMN IF NOT EXISTS "shipping_option_carrier" TEXT,
ADD COLUMN IF NOT EXISTS "shipping_option_service" TEXT,
ADD COLUMN IF NOT EXISTS "shipping_option_amount" TEXT,
ADD COLUMN IF NOT EXISTS "shipping_option_currency" TEXT,
ADD COLUMN IF NOT EXISTS "shipping_option_selected_at" TIMESTAMP(3);

-- Backfill stage for existing rows to keep behavior consistent:
-- 1) Label already created -> LABEL_PURCHASED
-- 2) Buyer selected a rate -> OPTION_SELECTED
-- 3) Buyer address exists -> ADDRESS_SET
-- 4) Otherwise -> ADDRESS_MISSING
UPDATE "Order"
SET "shipping_stage" = CASE
  WHEN "label_url" IS NOT NULL THEN 'LABEL_PURCHASED'
  WHEN "shipping_option_rate_id" IS NOT NULL THEN 'OPTION_SELECTED'
  WHEN "shipping_address" IS NOT NULL THEN 'ADDRESS_SET'
  ELSE 'ADDRESS_MISSING'
END;
