INSERT INTO "permissions" ("id", "action", "resource", "code", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'view', 'dashboard-guard', 'dashboard-guard:view', 'Can view dashboard-guard', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'view', 'dashboard-hr', 'dashboard-hr:view', 'Can view dashboard-hr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'view', 'dashboard-client', 'dashboard-client:view', 'Can view dashboard-client', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'view', 'dashboard-system', 'dashboard-system:view', 'Can view dashboard-system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
