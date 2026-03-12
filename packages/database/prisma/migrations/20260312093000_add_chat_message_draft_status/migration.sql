-- CreateEnum
CREATE TYPE "ChatMessageStatus" AS ENUM ('draft', 'sent', 'expired');

-- AlterTable
ALTER TABLE "chat_messages"
ADD COLUMN     "draft_expires_at" TIMESTAMP(3),
ADD COLUMN     "sent_at" TIMESTAMP(3),
ADD COLUMN     "status" "ChatMessageStatus" NOT NULL DEFAULT 'sent';

-- Backfill existing rows as sent
UPDATE "chat_messages"
SET "sent_at" = "created_at"
WHERE "status" = 'sent' AND "sent_at" IS NULL;

-- CreateIndex
CREATE INDEX "chat_messages_status_created_at_idx" ON "chat_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_status_draft_expires_at_idx" ON "chat_messages"("status", "draft_expires_at");
