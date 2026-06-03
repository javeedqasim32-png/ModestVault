-- Curation ordering for the Home "Featured" rail. NULL means "no explicit
-- order" so the listing falls to the end of the rail (and falls off entirely
-- when more than 8 listings carry is_featured = true). Admins set this via
-- the /admin/featured page.
ALTER TABLE "Listing" ADD COLUMN "featured_order" INTEGER;

-- Composite index so the home query can sort featured items quickly without
-- a sort step. Partial index keeps it small — only featured rows matter.
CREATE INDEX "Listing_is_featured_featured_order_idx"
    ON "Listing" ("is_featured", "featured_order")
    WHERE "is_featured" = true;
