-- DropForeignKey
ALTER TABLE "ticket_messages" DROP CONSTRAINT "ticket_messages_admin_id_fkey";

-- AlterTable
ALTER TABLE "ticket_messages" ADD COLUMN     "employee_id" TEXT,
ALTER COLUMN "admin_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
