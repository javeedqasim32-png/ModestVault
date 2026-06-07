-- Add Shippo label refund audit columns to Order. Populated by the admin's
-- refundOrder() server action when it attempts to refund an unused Shippo
-- shipping label, and by the Shippo transaction_updated webhook when the
-- refund's final state arrives (USPS can take up to 14 days, UPS faster).
ALTER TABLE "Order"
    ADD COLUMN "shippo_label_refund_id"     TEXT,
    ADD COLUMN "shippo_label_refunded_at"   TIMESTAMP(3),
    ADD COLUMN "shippo_label_refund_status" TEXT,
    ADD COLUMN "shippo_label_refund_error"  TEXT;
