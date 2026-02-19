/*
  Warnings:

  - You are about to drop the column `created_by_id` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `department_id` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `designation_id` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `employee_code` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `first_name` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `hashed_password` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `join_date` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `last_name` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `last_updated_by_id` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `left_date` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `office_id` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `employees` table. All the data in the column will be lost.
  - You are about to drop the `departments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `designations` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `full_name` to the `employees` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `employees` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "designations" DROP CONSTRAINT "designations_department_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_department_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_designation_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_last_updated_by_id_fkey";

-- DropIndex
DROP INDEX "employees_employee_code_idx";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "created_by_id",
DROP COLUMN "department_id",
DROP COLUMN "designation_id",
DROP COLUMN "employee_code",
DROP COLUMN "first_name",
DROP COLUMN "hashed_password",
DROP COLUMN "join_date",
DROP COLUMN "last_name",
DROP COLUMN "last_updated_by_id",
DROP COLUMN "left_date",
DROP COLUMN "title",
ADD COLUMN     "department" TEXT,
ADD COLUMN     "employee_number" TEXT,
ADD COLUMN     "full_name" TEXT NOT NULL,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "personnel_id" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- DropTable
DROP TABLE "departments";

-- DropTable
DROP TABLE "designations";

-- DropEnum
DROP TYPE "EmployeeTitle";

-- DropIndex
DROP INDEX "employees_phone_key";


-- CreateIndex
CREATE INDEX "employees_employee_number_idx" ON "employees"("employee_number");
