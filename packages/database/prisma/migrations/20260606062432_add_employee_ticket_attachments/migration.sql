-- DropForeignKey
ALTER TABLE "ticket_attachments" DROP CONSTRAINT "ticket_attachments_uploaded_by_admin_id_fkey";

-- AlterTable
ALTER TABLE "ticket_attachments" ADD COLUMN     "uploaded_by_employee_id" TEXT,
ALTER COLUMN "uploaded_by_admin_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_admin_id_fkey" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_employee_id_fkey" FOREIGN KEY ("uploaded_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
