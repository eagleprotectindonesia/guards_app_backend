-- CreateEnum
CREATE TYPE "OfficeMemoScope" AS ENUM ('all', 'department');

-- CreateTable
CREATE TABLE "office_memos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "scope" "OfficeMemoScope" NOT NULL,
    "department_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT,
    "last_updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "office_memos_is_active_idx" ON "office_memos"("is_active");

-- CreateIndex
CREATE INDEX "office_memos_start_date_idx" ON "office_memos"("start_date");

-- CreateIndex
CREATE INDEX "office_memos_end_date_idx" ON "office_memos"("end_date");

-- CreateIndex
CREATE INDEX "office_memos_scope_idx" ON "office_memos"("scope");

-- AddForeignKey
ALTER TABLE "office_memos" ADD CONSTRAINT "office_memos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_memos" ADD CONSTRAINT "office_memos_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
