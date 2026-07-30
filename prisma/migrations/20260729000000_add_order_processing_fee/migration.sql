-- Add buyer-facing processing & handling fee column to Order. Populated by
-- checkout-finalize from the value stored in the Stripe PaymentIntent's
-- metadata at checkout time. Non-null with default 0 so existing rows are
-- grandfathered as "no fee charged" (refund math for old orders still works).
ALTER TABLE "Order"
    ADD COLUMN "processing_fee_cents" INTEGER NOT NULL DEFAULT 0;
