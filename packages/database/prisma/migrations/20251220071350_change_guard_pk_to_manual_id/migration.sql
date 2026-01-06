/*
  Warnings:

  - You are about to drop the column `employee_id` on the `guards` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "guards_employee_id_key";

-- AlterTable
ALTER TABLE "guards" DROP COLUMN "employee_id";
