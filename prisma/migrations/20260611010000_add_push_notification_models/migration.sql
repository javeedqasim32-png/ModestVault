-- DeviceToken: registered FCM device tokens, one row per active install.
-- NotificationOutbox: queue of pending push sends drained by the cron at
-- /api/internal/dispatch-push-notifications.

CREATE TABLE "DeviceToken" (
    "id"          TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "platform"    TEXT NOT NULL,
    "app_version" TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at"  TIMESTAMP(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_user_id_revoked_at_idx" ON "DeviceToken"("user_id", "revoked_at");

ALTER TABLE "DeviceToken"
  ADD CONSTRAINT "DeviceToken_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationOutbox" (
    "id"              TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id"         TEXT NOT NULL,
    "type"            TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "data"            JSONB,
    "attempts"        INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at"         TIMESTAMP(3),
    "failed_reason"   TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationOutbox_sent_at_next_attempt_at_idx"
    ON "NotificationOutbox"("sent_at", "next_attempt_at");
CREATE INDEX "NotificationOutbox_user_id_sent_at_idx"
    ON "NotificationOutbox"("user_id", "sent_at");
