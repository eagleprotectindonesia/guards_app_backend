/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `office_shift_types` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `shift_types` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "office_shift_types_name_key";

-- DropIndex
DROP INDEX "shift_types_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "office_shift_types_active_name_key" ON "office_shift_types"("name") WHERE ("deleted_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "shift_types_active_name_key" ON "shift_types"("name") WHERE ("deleted_at" IS NULL);
