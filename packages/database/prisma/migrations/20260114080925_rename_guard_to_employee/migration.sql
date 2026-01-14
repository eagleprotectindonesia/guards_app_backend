-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('guard', 'supervisor', 'manager');

-- AlterEnum
BEGIN;
CREATE TYPE "ChatSenderType_new" AS ENUM ('admin', 'employee');
ALTER TABLE "chat_messages" ALTER COLUMN "sender" TYPE "ChatSenderType_new" USING ("sender"::text::"ChatSenderType_new");
ALTER TYPE "ChatSenderType" RENAME TO "ChatSenderType_old";
ALTER TYPE "ChatSenderType_new" RENAME TO "ChatSenderType";
DROP TYPE "public"."ChatSenderType_old";
COMMIT;

-- Rename the main table
ALTER TABLE "guards" RENAME TO "employees";

-- Rename columns in the main table
ALTER TABLE "employees" RENAME COLUMN "guard_code" TO "employee_code";

-- Rename foreign key columns in related tables
ALTER TABLE "shifts" RENAME COLUMN "guard_id" TO "employee_id";
ALTER TABLE "attendance" RENAME COLUMN "guard_id" TO "employee_id";
ALTER TABLE "checkins" RENAME COLUMN "guard_id" TO "employee_id";
ALTER TABLE "chat_messages" RENAME COLUMN "guard_id" TO "employee_id";

-- Add the 'role' column to 'employees' with the new enum type
ALTER TABLE "employees" ADD COLUMN "role" "EmployeeRole" NOT NULL DEFAULT 'guard';

-- Rename constraints and indexes on the main table
ALTER TABLE "employees" RENAME CONSTRAINT "guards_pkey" TO "employees_pkey";
ALTER INDEX "guards_phone_key" RENAME TO "employees_phone_key";
ALTER INDEX "guards_status_idx" RENAME TO "employees_status_idx";
ALTER INDEX "guards_deleted_at_idx" RENAME TO "employees_deleted_at_idx";
ALTER INDEX "guards_guard_code_idx" RENAME TO "employees_employee_code_idx";

-- Rename foreign key constraints on employees table
ALTER TABLE "employees" RENAME CONSTRAINT "guards_last_updated_by_id_fkey" TO "employees_last_updated_by_id_fkey";
ALTER TABLE "employees" RENAME CONSTRAINT "guards_created_by_id_fkey" TO "employees_created_by_id_fkey";

-- Rename indexes and constraints on related tables
-- Attendance
ALTER INDEX "attendance_guard_id_idx" RENAME TO "attendance_employee_id_idx";
ALTER TABLE "attendance" RENAME CONSTRAINT "attendance_guard_id_fkey" TO "attendance_employee_id_fkey";

-- Chat Messages
ALTER INDEX "chat_messages_guard_id_created_at_idx" RENAME TO "chat_messages_employee_id_created_at_idx";
ALTER TABLE "chat_messages" RENAME CONSTRAINT "chat_messages_guard_id_fkey" TO "chat_messages_employee_id_fkey";

-- Checkins
ALTER TABLE "checkins" RENAME CONSTRAINT "checkins_guard_id_fkey" TO "checkins_employee_id_fkey";

-- Shifts
ALTER INDEX "shifts_guard_id_date_idx" RENAME TO "shifts_employee_id_date_idx";
ALTER INDEX "shifts_guard_id_starts_at_idx" RENAME TO "shifts_employee_id_starts_at_idx";
ALTER INDEX "shifts_guard_id_status_date_starts_at_idx" RENAME TO "shifts_employee_id_status_date_starts_at_idx";
ALTER INDEX "shifts_guard_id_status_ends_at_idx" RENAME TO "shifts_employee_id_status_ends_at_idx";
ALTER INDEX "shifts_guard_id_status_starts_at_idx" RENAME TO "shifts_employee_id_status_starts_at_idx";
ALTER TABLE "shifts" RENAME CONSTRAINT "shifts_guard_id_fkey" TO "shifts_employee_id_fkey";