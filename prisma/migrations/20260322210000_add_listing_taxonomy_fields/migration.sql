ALTER TABLE "Listing"
ADD COLUMN "style" TEXT,
ADD COLUMN "subcategory" TEXT,
ADD COLUMN "type" TEXT;

UPDATE "Listing"
SET "style" = 'Everyday'
WHERE "style" IS NULL;

ALTER TABLE "Listing"
ALTER COLUMN "style" SET NOT NULL;

CREATE INDEX "Listing_status_moderation_status_created_at_idx"
ON "Listing"("status", "moderation_status", "created_at");

CREATE INDEX "Listing_style_category_subcategory_type_idx"
ON "Listing"("style", "category", "subcategory", "type");

CREATE INDEX "Listing_size_idx"
ON "Listing"("size");

CREATE INDEX "Listing_price_idx"
ON "Listing"("price");
