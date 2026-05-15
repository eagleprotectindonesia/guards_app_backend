-- CreateTable
CREATE TABLE "site_posts" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" BOOLEAN DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_posts_site_id_status_deleted_at_idx" ON "site_posts"("site_id", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_posts_site_id_name_key" ON "site_posts"("site_id", "name");

-- AddForeignKey
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
