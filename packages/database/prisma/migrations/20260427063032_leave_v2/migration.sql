/*
  Warnings:

  - The values [casual,emergency] on the enum `LeaveRequestReason` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "EmployeeGender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "EmployeeLeaveLedgerEntryType" AS ENUM ('entitlement', 'adjustment', 'deduction', 'reversal');

-- AlterEnum
BEGIN;
CREATE TYPE "LeaveRequestReason_new" AS ENUM ('sick', 'family_marriage', 'family_child_marriage', 'family_child_circumcision_baptism', 'family_death', 'family_spouse_death', 'special_maternity', 'special_miscarriage', 'special_paternity', 'special_emergency', 'annual');
ALTER TABLE "employee_leave_requests" ALTER COLUMN "reason" TYPE "LeaveRequestReason_new" USING ("reason"::text::"LeaveRequestReason_new");
ALTER TYPE "LeaveRequestReason" RENAME TO "LeaveRequestReason_old";
ALTER TYPE "LeaveRequestReason_new" RENAME TO "LeaveRequestReason";
DROP TYPE "public"."LeaveRequestReason_old";
COMMIT;

-- AlterTable
ALTER TABLE "employee_leave_requests" ADD COLUMN     "cycle_key" DATE,
ADD COLUMN     "deducted_annual_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "document_verified_at" TIMESTAMP(3),
ADD COLUMN     "document_verified_by_id" TEXT,
ADD COLUMN     "is_paid" BOOLEAN,
ADD COLUMN     "policy_snapshot" JSONB,
ADD COLUMN     "requires_document" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unpaid_days" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "gender" "EmployeeGender";

-- CreateTable
CREATE TABLE "employee_annual_leave_balances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled_days" INTEGER NOT NULL DEFAULT 12,
    "adjusted_days" INTEGER NOT NULL DEFAULT 0,
    "consumed_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_annual_leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_leave_ledger_entries" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_request_id" TEXT,
    "year" INTEGER NOT NULL,
    "entry_type" "EmployeeLeaveLedgerEntryType" NOT NULL,
    "days" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_leave_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_annual_leave_balances_year_idx" ON "employee_annual_leave_balances"("year");

-- CreateIndex
CREATE UNIQUE INDEX "employee_annual_leave_balances_employee_id_year_key" ON "employee_annual_leave_balances"("employee_id", "year");

-- CreateIndex
CREATE INDEX "employee_leave_ledger_entries_employee_id_year_created_at_idx" ON "employee_leave_ledger_entries"("employee_id", "year", "created_at");

-- CreateIndex
CREATE INDEX "employee_leave_ledger_entries_leave_request_id_idx" ON "employee_leave_ledger_entries"("leave_request_id");

-- CreateIndex
CREATE INDEX "employee_leave_requests_employee_id_cycle_key_idx" ON "employee_leave_requests"("employee_id", "cycle_key");

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_document_verified_by_id_fkey" FOREIGN KEY ("document_verified_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_annual_leave_balances" ADD CONSTRAINT "employee_annual_leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_ledger_entries" ADD CONSTRAINT "employee_leave_ledger_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_ledger_entries" ADD CONSTRAINT "employee_leave_ledger_entries_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "employee_leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_ledger_entries" ADD CONSTRAINT "employee_leave_ledger_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
