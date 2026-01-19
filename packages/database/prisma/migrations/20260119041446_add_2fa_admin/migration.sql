/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `shift_types` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `sites` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "attendance_shift_id_idx";

-- DropIndex
DROP INDEX "designations_name_department_id_key";

-- DropIndex
DROP INDEX "shifts_employee_id_date_idx";

-- DropIndex
DROP INDEX "shifts_employee_id_status_date_starts_at_idx";

-- DropIndex
DROP INDEX "shifts_site_id_date_idx";

-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "two_factor_secret" TEXT;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "employees_office_id_idx" ON "employees"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_types_name_key" ON "shift_types"("name");

-- CreateIndex
CREATE INDEX "shifts_site_id_idx" ON "shifts"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_name_key" ON "sites"("name");
