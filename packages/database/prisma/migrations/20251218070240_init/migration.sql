-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('superadmin', 'admin');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('on_time', 'late', 'invalid');

-- CreateEnum
CREATE TYPE "AlertReason" AS ENUM ('missed_checkin', 'missed_attendance');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertResolution" AS ENUM ('standard', 'forgiven', 'auto');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'late', 'pending_verification');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "guard_code" VARCHAR(10),
    "status" BOOLEAN DEFAULT true,
    "join_date" DATE,
    "left_date" DATE,
    "note" TEXT,
    "last_updated_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_name" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "last_updated_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "shift_type_id" TEXT NOT NULL,
    "guard_id" TEXT,
    "date" DATE NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'scheduled',
    "check_in_status" "CheckInStatus",
    "required_checkin_interval_minutes" INTEGER NOT NULL DEFAULT 20,
    "grace_minutes" INTEGER NOT NULL DEFAULT 2,
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "missed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "guard_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "status" "CheckInStatus" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "reason" "AlertReason" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_by_id" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_id" TEXT,
    "resolution_note" TEXT,
    "resolution_type" "AlertResolution",

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "guard_id" TEXT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picture" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "guards_phone_key" ON "guards"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "guards_employee_id_key" ON "guards"("employee_id");

-- CreateIndex
CREATE INDEX "guards_status_idx" ON "guards"("status");

-- CreateIndex
CREATE INDEX "shifts_site_id_date_idx" ON "shifts"("site_id", "date");

-- CreateIndex
CREATE INDEX "shifts_guard_id_date_idx" ON "shifts"("guard_id", "date");

-- CreateIndex
CREATE INDEX "shifts_guard_id_starts_at_idx" ON "shifts"("guard_id", "starts_at");

-- CreateIndex
CREATE INDEX "shifts_starts_at_ends_at_idx" ON "shifts"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "shifts_guard_id_status_starts_at_idx" ON "shifts"("guard_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "shifts_guard_id_status_ends_at_idx" ON "shifts"("guard_id", "status", "ends_at");

-- CreateIndex
CREATE INDEX "shifts_guard_id_status_date_starts_at_idx" ON "shifts"("guard_id", "status", "date", "starts_at");

-- CreateIndex
CREATE INDEX "checkins_created_at_idx" ON "checkins"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_shift_id_at_key" ON "checkins"("shift_id", "at");

-- CreateIndex
CREATE INDEX "alerts_site_id_created_at_idx" ON "alerts"("site_id", "created_at");

-- CreateIndex
CREATE INDEX "alerts_reason_idx" ON "alerts"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_shift_id_reason_window_start_key" ON "alerts"("shift_id", "reason", "window_start");

-- CreateIndex
CREATE INDEX "attendance_recorded_at_idx" ON "attendance"("recorded_at");

-- CreateIndex
CREATE INDEX "attendance_guard_id_idx" ON "attendance"("guard_id");

-- CreateIndex
CREATE INDEX "attendance_shift_id_idx" ON "attendance"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_shift_id_key" ON "attendance"("shift_id");

-- AddForeignKey
ALTER TABLE "guards" ADD CONSTRAINT "guards_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_guard_id_fkey" FOREIGN KEY ("guard_id") REFERENCES "guards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_type_id_fkey" FOREIGN KEY ("shift_type_id") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_guard_id_fkey" FOREIGN KEY ("guard_id") REFERENCES "guards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_guard_id_fkey" FOREIGN KEY ("guard_id") REFERENCES "guards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
