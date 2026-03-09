-- CreateTable
CREATE TABLE "admin_chat_conversation_states" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "muted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_chat_conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_chat_conversation_states_admin_id_is_archived_idx" ON "admin_chat_conversation_states"("admin_id", "is_archived");

-- CreateIndex
CREATE INDEX "admin_chat_conversation_states_employee_id_idx" ON "admin_chat_conversation_states"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_chat_conversation_states_admin_id_employee_id_key" ON "admin_chat_conversation_states"("admin_id", "employee_id");

-- AddForeignKey
ALTER TABLE "admin_chat_conversation_states" ADD CONSTRAINT "admin_chat_conversation_states_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_chat_conversation_states" ADD CONSTRAINT "admin_chat_conversation_states_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
