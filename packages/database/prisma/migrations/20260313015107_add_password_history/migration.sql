-- CreateEnum
CREATE TYPE "ChatMessageStatus" AS ENUM ('draft', 'sent', 'expired');

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "draft_expires_at" TIMESTAMP(3),
ADD COLUMN     "sent_at" TIMESTAMP(3),
ADD COLUMN     "status" "ChatMessageStatus" NOT NULL DEFAULT 'sent';

-- CreateTable
CREATE TABLE "employee_password_histories" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_password_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_password_histories_employee_id_created_at_idx" ON "employee_password_histories"("employee_id", "created_at");

-- AddForeignKey
ALTER TABLE "employee_password_histories" ADD CONSTRAINT "employee_password_histories_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
