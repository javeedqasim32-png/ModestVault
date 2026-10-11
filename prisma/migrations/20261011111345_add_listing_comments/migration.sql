-- CreateTable
CREATE TABLE "ListingComment" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "body" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReport" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingComment_listing_id_created_at_idx" ON "ListingComment"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "ListingComment_parent_id_idx" ON "ListingComment"("parent_id");

-- CreateIndex
CREATE INDEX "ListingComment_user_id_created_at_idx" ON "ListingComment"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "CommentReport_comment_id_idx" ON "CommentReport"("comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReport_comment_id_reporter_id_key" ON "CommentReport"("comment_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "ListingComment" ADD CONSTRAINT "ListingComment_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingComment" ADD CONSTRAINT "ListingComment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingComment" ADD CONSTRAINT "ListingComment_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ListingComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "ListingComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

