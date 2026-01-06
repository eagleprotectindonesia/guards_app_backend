-- CreateTable
CREATE TABLE "system_settings" (
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("name")
);

-- Inject default settings
INSERT INTO "system_settings" ("name", "value", "note") 
VALUES ('MAX_CHECKIN_DISTANCE_METERS', '50', 'Maximum allowed distance (in meters) between guard and site for a valid check-in.');
