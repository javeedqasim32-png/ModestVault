-- Buyer-facing PromotionCode + PromotionCodeRedemption. Distinct from
-- PromotionCampaign (seller-absorbs) — these are Modaire-absorbs codes
-- entered at checkout by buyers. Discount comes out of Modaire's platform
-- fee; seller still receives 85% of the ORIGINAL listing price.
--
-- Also extends Order with three columns (audit link + snapshot fields) so
-- refund / reporting logic doesn't need to re-read the possibly-deactivated
-- code row. All new Order columns default to NULL/0 so existing orders
-- grandfather cleanly with no data migration.

CREATE TABLE "PromotionCode" (
    "id"                     TEXT NOT NULL,
    "code"                   TEXT NOT NULL,
    "discount_percent"       INTEGER NOT NULL,
    "absorber"               TEXT NOT NULL DEFAULT 'MODAIRE',
    "applies_to_listing_id"  TEXT,
    "applies_to_buyer_id"    TEXT,
    "max_redemptions"        INTEGER,
    "redemption_count"       INTEGER NOT NULL DEFAULT 0,
    "starts_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"             TIMESTAMP(3),
    "active"                 BOOLEAN NOT NULL DEFAULT true,
    "notes"                  TEXT,
    "created_by_id"          TEXT,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionCode_code_key" ON "PromotionCode"("code");
CREATE INDEX "PromotionCode_active_starts_at_expires_at_idx"
    ON "PromotionCode"("active", "starts_at", "expires_at");

CREATE TABLE "PromotionCodeRedemption" (
    "id"                 TEXT NOT NULL,
    "promotion_code_id"  TEXT NOT NULL,
    "order_id"           TEXT NOT NULL,
    "buyer_id"           TEXT NOT NULL,
    "listing_id"         TEXT NOT NULL,
    "discount_cents"     INTEGER NOT NULL,
    "redeemed_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionCodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionCodeRedemption_order_id_key"
    ON "PromotionCodeRedemption"("order_id");
CREATE INDEX "PromotionCodeRedemption_buyer_id_idx"
    ON "PromotionCodeRedemption"("buyer_id");
CREATE INDEX "PromotionCodeRedemption_promotion_code_id_redeemed_at_idx"
    ON "PromotionCodeRedemption"("promotion_code_id", "redeemed_at");

ALTER TABLE "PromotionCodeRedemption"
    ADD CONSTRAINT "PromotionCodeRedemption_promotion_code_id_fkey"
    FOREIGN KEY ("promotion_code_id") REFERENCES "PromotionCode"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromotionCodeRedemption"
    ADD CONSTRAINT "PromotionCodeRedemption_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "Order"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Order gets three new columns. All default-nullable / default-0 so refund /
-- reporting logic on existing rows behaves as if no code was applied.
ALTER TABLE "Order"
    ADD COLUMN "promotion_code_id"        TEXT,
    ADD COLUMN "promotion_code_absorber"  TEXT,
    ADD COLUMN "promotion_discount_cents" INTEGER NOT NULL DEFAULT 0;
