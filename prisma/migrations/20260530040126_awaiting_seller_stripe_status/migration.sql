-- AlterTable: track when an "unclaimed payout" reminder was sent so the cron is idempotent
ALTER TABLE "Order" ADD COLUMN "unclaimed_reminder_sent_at" TIMESTAMP(3);

-- CreateIndex: used by UnpaidEarningsBanner aggregate + transfer-release cron filter
CREATE INDEX "Order_seller_transfer_status_idx" ON "Order"("seller_transfer_status");
