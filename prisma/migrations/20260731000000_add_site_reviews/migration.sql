-- Site-level reviews. One review per user (unique on user_id).
-- Auto-published on submit; admin can HIDE any review with an audit
-- trail. Feeds AggregateRating schema on /reviews + homepage once
-- count reaches 5.

CREATE TABLE "SiteReview" (
    "id"             TEXT NOT NULL,
    "user_id"        TEXT NOT NULL,
    "rating"         INTEGER NOT NULL,
    "body"           TEXT,
    "status"         TEXT NOT NULL DEFAULT 'PUBLISHED',
    "hidden_at"      TIMESTAMP(3),
    "hidden_by_id"   TEXT,
    "hidden_reason"  TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteReview_user_id_key" ON "SiteReview"("user_id");
CREATE INDEX "SiteReview_status_created_at_idx"
    ON "SiteReview"("status", "created_at");

ALTER TABLE "SiteReview"
    ADD CONSTRAINT "SiteReview_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
