/*
  Warnings:

  - You are about to drop the column `review_note` on the `employee_leave_requests` table. All the data in the column will be lost.
  - Added the required column `reason` to the `employee_leave_requests` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LeaveRequestReason" AS ENUM ('sick', 'casual', 'emergency');

-- AlterTable
ALTER TABLE "employee_leave_requests" DROP COLUMN "review_note",
ADD COLUMN     "admin_note" TEXT,
ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "employee_note" TEXT,
DROP COLUMN "reason",
ADD COLUMN     "reason" "LeaveRequestReason" NOT NULL;
