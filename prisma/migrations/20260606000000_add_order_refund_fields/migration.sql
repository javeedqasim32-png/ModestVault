-- Add refund / cancel audit fields to Order. Populated by the new admin
-- refundOrder() / cancelOrder() server actions. All nullable so the migration
-- is purely additive — no data rewrite, no row locks.
ALTER TABLE "Order" ADD COLUMN "refund_id" TEXT;
ALTER TABLE "Order" ADD COLUMN "refunded_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "refund_reason" TEXT;
ALTER TABLE "Order" ADD COLUMN "refund_note" TEXT;
ALTER TABLE "Order" ADD COLUMN "refund_initiator_id" TEXT;
ALTER TABLE "Order" ADD COLUMN "seller_transfer_reversed_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "seller_transfer_reversal_id" TEXT;

-- Index supports admin reporting queries (e.g., "refunds in the last 30 days").
CREATE INDEX "Order_refunded_at_idx" ON "Order"("refunded_at");
