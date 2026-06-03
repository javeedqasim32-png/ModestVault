-- Marks Orders that were checked out together in one bundled Stripe session
-- (same-seller multi-item) so the Shippo label, tracking number, carrier,
-- and delivery webhook all apply to the whole group instead of needing
-- separate shipping per item.
ALTER TABLE "Order" ADD COLUMN "batch_id" TEXT;

-- Lookup-by-batch is hot during ship-label purchase + Shippo webhook fanout.
CREATE INDEX "Order_batch_id_idx" ON "Order"("batch_id");
