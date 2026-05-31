-- AlterTable: timestamp of when the post-signup welcome modal was dismissed.
-- NULL = never seen → modal should show on next home-page visit.
ALTER TABLE "User" ADD COLUMN "welcome_seen_at" TIMESTAMP(3);
