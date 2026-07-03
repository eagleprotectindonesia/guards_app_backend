-- AlterEnum
ALTER TYPE "GroupChatParticipantRole" ADD VALUE 'lead';

-- AlterTable
ALTER TABLE "group_chats" ADD COLUMN     "source_ref" TEXT,
ADD COLUMN     "source_type" TEXT;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "arrived_at" TIMESTAMPTZ(6),
ADD COLUMN     "departed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "group_chats_source_type_source_ref_idx" ON "group_chats"("source_type", "source_ref");

-- CreateIndex
CREATE INDEX "idx_group_chats_active_escort" ON "group_chats"("source_type", "source_ref") WHERE (archived_at IS NULL AND source_type = 'escort');
