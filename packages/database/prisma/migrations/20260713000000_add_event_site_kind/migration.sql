-- Add 'event' to SiteKind enum
ALTER TYPE "SiteKind" ADD VALUE 'event';

-- Backfill: re-tag existing auto-created event sites from 'fixed' → 'event'
-- Sites whose names start with 'Event: ' were auto-created by the schedule
-- builder for event_temporary shifts and should not appear in the site list.
UPDATE "sites"
SET "kind" = 'event'
WHERE "kind" = 'fixed'
  AND "name" LIKE 'Event: %'
  AND "deleted_at" IS NULL;
