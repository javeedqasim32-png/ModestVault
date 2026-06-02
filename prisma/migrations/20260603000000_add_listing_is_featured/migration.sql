-- Curation flag, independent of moderation_status. When true, the listing
-- surfaces on the Home "New In" rail. Going forward only the admin
-- "Approve & Feature" action sets this; plain Approve leaves is_featured=false
-- so newly-approved listings no longer auto-promote to Home.
ALTER TABLE "Listing" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every currently-approved listing keeps its place on Home so we
-- don't regress existing content the day this ships.
UPDATE "Listing" SET "is_featured" = true WHERE "moderation_status" = 'APPROVED';
