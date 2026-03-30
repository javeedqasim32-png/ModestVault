-- Create conversation tables for buyer <-> seller messaging
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "buyer_id" TEXT NOT NULL,
  "seller_id" TEXT NOT NULL,
  "listing_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMessage" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_buyer_id_seller_id_key" ON "Conversation"("buyer_id", "seller_id");
CREATE INDEX "Conversation_buyer_id_updated_at_idx" ON "Conversation"("buyer_id", "updated_at");
CREATE INDEX "Conversation_seller_id_updated_at_idx" ON "Conversation"("seller_id", "updated_at");

CREATE INDEX "ConversationMessage_conversation_id_created_at_idx" ON "ConversationMessage"("conversation_id", "created_at");
CREATE INDEX "ConversationMessage_sender_id_created_at_idx" ON "ConversationMessage"("sender_id", "created_at");
CREATE INDEX "ConversationMessage_conversation_id_read_at_idx" ON "ConversationMessage"("conversation_id", "read_at");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_buyer_id_fkey"
  FOREIGN KEY ("buyer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationMessage"
  ADD CONSTRAINT "ConversationMessage_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationMessage"
  ADD CONSTRAINT "ConversationMessage_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
