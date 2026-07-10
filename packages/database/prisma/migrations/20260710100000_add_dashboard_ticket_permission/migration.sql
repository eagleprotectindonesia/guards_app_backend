INSERT INTO "permissions" ("id", "action", "resource", "code", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'view', 'dashboard-ticket', 'dashboard-ticket:view', 'Can view dashboard-ticket', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
