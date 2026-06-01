-- CreateTable: server-backed listing drafts so a seller's in-progress
-- listings sync across devices (replaces the prior localStorage-only
-- approach). Photo bytes still live on S3 under drafts/<user_id>/<draft_id>/.
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "style" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "type" TEXT,
    "price" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "condition" TEXT,
    "size" TEXT,
    "measurements" TEXT,
    "photo_urls" TEXT[],
    "generated_image_urls" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: list-by-user ordered by recency.
CREATE INDEX "Draft_user_id_updated_at_idx" ON "Draft"("user_id", "updated_at");

-- AddForeignKey: cascade delete drafts if the user is removed.
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
