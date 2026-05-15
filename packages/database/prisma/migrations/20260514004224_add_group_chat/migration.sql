-- CreateEnum
CREATE TYPE "GroupChatParticipantType" AS ENUM ('admin', 'employee');

-- CreateEnum
CREATE TYPE "GroupChatParticipantRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "GroupChatParticipantStatus" AS ENUM ('active', 'left', 'removed');

-- CreateEnum
CREATE TYPE "GroupChatMembershipEventType" AS ENUM ('created', 'member_added', 'member_removed', 'member_left', 'owner_transferred', 'group_updated', 'group_archived');

-- CreateTable
CREATE TABLE "group_chats" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_by_admin_id" TEXT,
    "created_by_employee_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_content" TEXT,
    "last_message_sender_name" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_participants" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "participant_type" "GroupChatParticipantType" NOT NULL,
    "admin_id" TEXT,
    "employee_id" TEXT,
    "role" "GroupChatParticipantRole" NOT NULL DEFAULT 'member',
    "status" "GroupChatParticipantStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visible_from_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "removed_by_participant_id" TEXT,
    "last_read_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_chat_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_messages" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "sender_participant_id" TEXT NOT NULL,
    "sender_type" "GroupChatParticipantType" NOT NULL,
    "admin_id" TEXT,
    "employee_id" TEXT,
    "sender_name" TEXT NOT NULL,
    "status" "ChatMessageStatus" NOT NULL DEFAULT 'sent',
    "content" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "draft_expires_at" TIMESTAMP(3),

    CONSTRAINT "group_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_read_receipts" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chat_read_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chat_membership_events" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "actor_participant_id" TEXT,
    "target_participant_id" TEXT,
    "type" "GroupChatMembershipEventType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chat_membership_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_chats_last_message_at_idx" ON "group_chats"("last_message_at" DESC);

-- CreateIndex
CREATE INDEX "group_chats_archived_at_idx" ON "group_chats"("archived_at");

-- CreateIndex
CREATE INDEX "group_chat_participants_group_id_status_idx" ON "group_chat_participants"("group_id", "status");

-- CreateIndex
CREATE INDEX "group_chat_participants_admin_id_status_idx" ON "group_chat_participants"("admin_id", "status");

-- CreateIndex
CREATE INDEX "group_chat_participants_employee_id_status_idx" ON "group_chat_participants"("employee_id", "status");

-- CreateIndex
CREATE INDEX "group_chat_participants_participant_type_admin_id_idx" ON "group_chat_participants"("participant_type", "admin_id");

-- CreateIndex
CREATE INDEX "group_chat_participants_participant_type_employee_id_idx" ON "group_chat_participants"("participant_type", "employee_id");

-- CreateIndex
CREATE INDEX "group_chat_messages_group_id_created_at_idx" ON "group_chat_messages"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "group_chat_messages_sender_participant_id_idx" ON "group_chat_messages"("sender_participant_id");

-- CreateIndex
CREATE INDEX "group_chat_messages_status_draft_expires_at_idx" ON "group_chat_messages"("status", "draft_expires_at");

-- CreateIndex
CREATE INDEX "group_chat_read_receipts_participant_id_read_at_idx" ON "group_chat_read_receipts"("participant_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_chat_read_receipts_message_id_participant_id_key" ON "group_chat_read_receipts"("message_id", "participant_id");

-- CreateIndex
CREATE INDEX "group_chat_membership_events_group_id_created_at_idx" ON "group_chat_membership_events"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "group_chat_participants" ADD CONSTRAINT "group_chat_participants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_messages" ADD CONSTRAINT "group_chat_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chat_membership_events" ADD CONSTRAINT "group_chat_membership_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
