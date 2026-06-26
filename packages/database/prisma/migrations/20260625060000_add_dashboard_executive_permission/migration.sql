-- Add the new dashboard-executive:view permission and migrate any role grants from the old dashboard-system:view

INSERT INTO "permissions" ("id", "action", "resource", "code", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text,
  'view',
  'dashboard-executive',
  'dashboard-executive:view',
  'Can view executive overview dashboard',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

UPDATE "_RolePermissions"
SET "A" = (SELECT id FROM "permissions" WHERE "code" = 'dashboard-executive:view')
WHERE "A" = (SELECT id FROM "permissions" WHERE "code" = 'dashboard-system:view')
  AND "A" IS DISTINCT FROM (SELECT id FROM "permissions" WHERE "code" = 'dashboard-executive:view');

DELETE FROM "permissions" WHERE "code" = 'dashboard-system:view';
