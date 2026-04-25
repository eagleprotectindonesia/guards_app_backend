-- Create enum for admin notification type
CREATE TYPE "AdminNotificationType" AS ENUM ('leave_request_created');

-- Create admin_notifications table
CREATE TABLE "admin_notifications" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "type" "AdminNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- Indexes for unread counts and recent lists
CREATE INDEX "admin_notifications_admin_id_read_at_created_at_idx"
ON "admin_notifications"("admin_id", "read_at", "created_at");

CREATE INDEX "admin_notifications_admin_id_created_at_idx"
ON "admin_notifications"("admin_id", "created_at" DESC);

-- Foreign key
ALTER TABLE "admin_notifications"
ADD CONSTRAINT "admin_notifications_admin_id_fkey"
FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
