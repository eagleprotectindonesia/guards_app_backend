-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "employee_leave_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_leave_requests_employee_id_start_date_idx" ON "employee_leave_requests"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_leave_requests_status_created_at_idx" ON "employee_leave_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "employee_leave_requests_start_date_end_date_idx" ON "employee_leave_requests"("start_date", "end_date");

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
