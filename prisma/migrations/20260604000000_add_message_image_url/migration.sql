-- Optional image attachment for direct messages. NULL when the message is
-- text-only; populated with an S3 URL when the sender attached a photo.
ALTER TABLE "ConversationMessage" ADD COLUMN "image_url" TEXT;
