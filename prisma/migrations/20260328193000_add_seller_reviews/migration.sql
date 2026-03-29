-- CreateTable
CREATE TABLE "SellerReview" (
  "id" TEXT NOT NULL,
  "seller_id" TEXT NOT NULL,
  "reviewer_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SellerReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerReview_seller_id_reviewer_id_key" ON "SellerReview"("seller_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "SellerReview_seller_id_created_at_idx" ON "SellerReview"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "SellerReview_reviewer_id_created_at_idx" ON "SellerReview"("reviewer_id", "created_at");

-- AddForeignKey
ALTER TABLE "SellerReview" ADD CONSTRAINT "SellerReview_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerReview" ADD CONSTRAINT "SellerReview_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
