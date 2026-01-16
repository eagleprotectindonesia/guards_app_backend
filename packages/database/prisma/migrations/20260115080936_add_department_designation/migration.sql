/*
  Warnings:

  - You are about to drop the column `name` on the `employees` table. All the data in the column will be lost.
  - Added the required column `first_name` to the `employees` table without a default value. This is not possible if the table is not empty.

*/
 -- 1. Create the Enum first
 CREATE TYPE "EmployeeTitle" AS ENUM ('Mr', 'Miss', 'Mrs');
 
 -- 2. Add new columns as NULLABLE first
 ALTER TABLE "employees" ADD COLUMN "first_name" TEXT;
 ALTER TABLE "employees" ADD COLUMN "last_name" TEXT;
 ALTER TABLE "employees" ADD COLUMN "title" "EmployeeTitle" NOT NULL DEFAULT 'Mr';
 ALTER TABLE "employees" ADD COLUMN "department_id" TEXT;
 ALTER TABLE "employees" ADD COLUMN "designation_id" TEXT;

-- 3. Data Migration: Split the existing 'name' into 'first_name' and 'last_name'
-- This logic takes the first word as first_name and the rest as last_name
UPDATE "employees"
SET "first_name" = CASE
    WHEN position(' ' in "name") > 0 THEN substring("name" from 1 for position(' ' in "name") - 1)
    ELSE "name"
END,
"last_name" = CASE
    WHEN position(' ' in "name") > 0 THEN substring("name" from position(' ' in "name") + 1)
    ELSE NULL
END;

-- 4. Enforce NOT NULL on first_name after data is populated
-- If some names were empty, provide a fallback to avoid errors
UPDATE "employees" SET "first_name" = 'Employee' WHERE "first_name" IS NULL OR "first_name" = '';
ALTER TABLE "employees" ALTER COLUMN "first_name" SET NOT NULL;

-- 5. Drop the old 'name' column
ALTER TABLE "employees" DROP COLUMN "name";

-- 6. Apply other schema changes
ALTER TABLE "employees" ALTER COLUMN "employee_code" SET DATA TYPE VARCHAR(12);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_deleted_at_idx" ON "departments"("deleted_at");

-- CreateIndex
CREATE INDEX "designations_deleted_at_idx" ON "designations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "designations_name_department_id_key" ON "designations"("name", "department_id");

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
