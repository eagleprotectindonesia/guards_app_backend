/*
  Warnings:

  - You are about to drop the column `attachment_url` on the `chat_messages` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "attachment_url",
ADD COLUMN     "attachments" TEXT[];
