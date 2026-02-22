/*
  Warnings:

  - You are about to drop the column `admin_id` on the `changelogs` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ChangelogActor" AS ENUM ('admin', 'system', 'unknown');

-- DropForeignKey
ALTER TABLE "changelogs" DROP CONSTRAINT "changelogs_admin_id_fkey";

-- AlterTable
ALTER TABLE "changelogs" DROP COLUMN "admin_id",
ADD COLUMN     "actor" "ChangelogActor" NOT NULL DEFAULT 'admin',
ADD COLUMN     "actor_id" TEXT;

-- AddForeignKey
ALTER TABLE "changelogs" ADD CONSTRAINT "changelogs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
