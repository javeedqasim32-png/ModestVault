-- Adds RefreshToken (mobile auth) and soft-delete columns on User (App Store /
-- Play Store account deletion requirement: rows must remain for purge job to
-- run on a timer, not vanish immediately).

ALTER TABLE "User"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deletion_scheduled_purge_at" TIMESTAMP(3);

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_token_hash_key" ON "RefreshToken"("token_hash");
CREATE INDEX "RefreshToken_user_id_revoked_at_idx" ON "RefreshToken"("user_id", "revoked_at");
CREATE INDEX "RefreshToken_expires_at_idx" ON "RefreshToken"("expires_at");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
