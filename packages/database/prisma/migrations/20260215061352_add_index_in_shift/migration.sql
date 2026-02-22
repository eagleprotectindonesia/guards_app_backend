-- CreateIndex
CREATE INDEX "shifts_status_ends_at_deleted_at_idx" ON "shifts"("status", "ends_at", "deleted_at");
