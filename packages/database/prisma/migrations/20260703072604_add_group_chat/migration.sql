/*
  Warnings:

  - You are about to drop the column `source_ref` on the `group_chats` table. All the data in the column will be lost.
  - You are about to drop the column `source_type` on the `group_chats` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[group_shift_id]` on the table `group_chats` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "group_chats_source_type_source_ref_idx";

-- DropIndex
DROP INDEX "idx_group_chats_active_escort";

-- AlterTable
ALTER TABLE "group_chats" DROP COLUMN "source_ref",
DROP COLUMN "source_type",
ADD COLUMN     "group_shift_id" TEXT;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "group_shift_id" TEXT;

-- CreateTable
CREATE TABLE "group_shifts" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "end_site_id" TEXT NOT NULL,
    "shift_type_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "ShiftKind" NOT NULL DEFAULT 'escort',
    "client_name" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_shifts_site_id_end_site_id_date_idx" ON "group_shifts"("site_id", "end_site_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "group_shifts_site_id_end_site_id_date_key" ON "group_shifts"("site_id", "end_site_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "group_chats_group_shift_id_key" ON "group_chats"("group_shift_id");

-- CreateIndex
CREATE INDEX "shifts_group_shift_id_idx" ON "shifts"("group_shift_id");

-- AddForeignKey
ALTER TABLE "group_chats" ADD CONSTRAINT "group_chats_group_shift_id_fkey" FOREIGN KEY ("group_shift_id") REFERENCES "group_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_shifts" ADD CONSTRAINT "group_shifts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_shifts" ADD CONSTRAINT "group_shifts_end_site_id_fkey" FOREIGN KEY ("end_site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_shifts" ADD CONSTRAINT "group_shifts_shift_type_id_fkey" FOREIGN KEY ("shift_type_id") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_group_shift_id_fkey" FOREIGN KEY ("group_shift_id") REFERENCES "group_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
