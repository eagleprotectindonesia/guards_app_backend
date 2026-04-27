-- AlterTable
ALTER TABLE "admins"
ADD COLUMN IF NOT EXISTS "include_fallback_leave_queue" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_ownership_assignments" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "department_key" TEXT,
    "office_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_ownership_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_ownership_assignments_scope_check" CHECK ("department_key" IS NOT NULL OR "office_id" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "admin_ownership_assignments_admin_id_is_active_idx"
ON "admin_ownership_assignments"("admin_id", "is_active");

-- CreateIndex
CREATE INDEX "admin_ownership_assignments_department_key_is_active_idx"
ON "admin_ownership_assignments"("department_key", "is_active");

-- CreateIndex
CREATE INDEX "admin_ownership_assignments_office_id_is_active_idx"
ON "admin_ownership_assignments"("office_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "admin_ownership_assignments_admin_id_scope_uniq"
ON "admin_ownership_assignments"("admin_id", COALESCE("department_key", ''), COALESCE("office_id", ''));

-- AddForeignKey
ALTER TABLE "admin_ownership_assignments"
ADD CONSTRAINT "admin_ownership_assignments_admin_id_fkey"
FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_ownership_assignments"
ADD CONSTRAINT "admin_ownership_assignments_office_id_fkey"
FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
