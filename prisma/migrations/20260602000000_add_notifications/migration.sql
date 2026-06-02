-- CreateTable: persistent per-user notifications so users get cross-device
-- in-app alerts (sale, delivery, etc.) — replaces the prior localStorage-only
-- "NEW" badge that was per-device and lost on storage clear.
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link_url" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: list a user's notifications newest-first.
CREATE INDEX "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at");

-- CreateIndex: unread-count query for the navbar bell badge.
CREATE INDEX "Notification_user_id_read_at_idx" ON "Notification"("user_id", "read_at");

-- AddForeignKey: cascade delete notifications if the recipient is removed.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
