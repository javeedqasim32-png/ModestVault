-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "offers_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reserved_offer_id" TEXT,
ADD COLUMN     "reserved_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "current_amount" DECIMAL(65,30) NOT NULL,
    "current_turn" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "binding" BOOLEAN NOT NULL DEFAULT false,
    "setup_intent_id" TEXT,
    "payment_state" TEXT,
    "pay_window_expires_at" TIMESTAMP(3),
    "purchase_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_purchase_id_key" ON "Offer"("purchase_id");

-- CreateIndex
CREATE INDEX "Offer_listing_id_status_idx" ON "Offer"("listing_id", "status");

-- CreateIndex
CREATE INDEX "Offer_buyer_id_status_updated_at_idx" ON "Offer"("buyer_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "Offer_seller_id_status_updated_at_idx" ON "Offer"("seller_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "Offer_status_expires_at_idx" ON "Offer"("status", "expires_at");

-- CreateIndex
CREATE INDEX "OfferEvent_offer_id_created_at_idx" ON "OfferEvent"("offer_id", "created_at");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

