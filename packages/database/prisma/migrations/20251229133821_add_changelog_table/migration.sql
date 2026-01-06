-- CreateTable
CREATE TABLE "changelogs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "details" JSONB,
    "admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changelogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "changelogs_entity_type_entity_id_idx" ON "changelogs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "changelogs_entity_type_created_at_idx" ON "changelogs"("entity_type", "created_at");

-- CreateIndex
CREATE INDEX "changelogs_created_at_idx" ON "changelogs"("created_at");

-- AddForeignKey
ALTER TABLE "changelogs" ADD CONSTRAINT "changelogs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
