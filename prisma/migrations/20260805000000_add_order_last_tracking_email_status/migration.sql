-- AlterTable: track the last Shippo tracking status we emailed the buyer about
-- so the webhook can dedupe against Shippo's per-scan `track_updated` fires.
-- NULL default = existing rows will send once on their next status transition
-- (harmless; the buyer already got the historical emails).
ALTER TABLE "Order" ADD COLUMN "last_tracking_email_status" TEXT;
