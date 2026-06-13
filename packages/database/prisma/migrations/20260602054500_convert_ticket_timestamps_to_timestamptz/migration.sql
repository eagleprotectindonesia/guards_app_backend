ALTER TABLE "tickets"
  ALTER COLUMN "claimed_at" TYPE TIMESTAMPTZ(6) USING "claimed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "solved_at" TYPE TIMESTAMPTZ(6) USING "solved_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "closed_at" TYPE TIMESTAMPTZ(6) USING "closed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "cannot_resolve_at" TYPE TIMESTAMPTZ(6) USING "cannot_resolve_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "ticket_assigned_roles"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "ticket_assigned_employees"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "ticket_messages"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "ticket_attachments"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "ticket_history"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC';
