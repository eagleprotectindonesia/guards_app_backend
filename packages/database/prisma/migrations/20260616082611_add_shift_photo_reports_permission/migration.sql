INSERT INTO "permissions" ("id", "action", "resource", "code", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'view', 'shift-photo-reports', 'shift-photo-reports:view', 'Can view shift-photo-reports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'create', 'shift-photo-reports', 'shift-photo-reports:create', 'Can create shift-photo-reports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
