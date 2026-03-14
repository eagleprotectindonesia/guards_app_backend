-- CreateTable
CREATE TABLE "chat_conversations" (
    "employee_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "last_message_content" TEXT NOT NULL,
    "last_message_sender" "ChatSenderType" NOT NULL,
    "last_message_admin_id" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("employee_id")
);

-- CreateIndex
CREATE INDEX "chat_conversations_last_message_at_idx" ON "chat_conversations"("last_message_at" DESC);

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
