ALTER TABLE "employees" DROP COLUMN "token_version";

CREATE TABLE "employee_sessions" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "client_type" TEXT NOT NULL,
    "device_info" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_sessions_pkey" PRIMARY KEY ("id")
);

DELETE FROM "fcm_tokens";

ALTER TABLE "fcm_tokens" DROP CONSTRAINT "fcm_tokens_employee_id_fkey";
DROP INDEX "fcm_tokens_employee_id_idx";
ALTER TABLE "fcm_tokens" DROP COLUMN "employee_id";
ALTER TABLE "fcm_tokens" ADD COLUMN "employee_session_id" TEXT NOT NULL;

CREATE INDEX "employee_sessions_employee_id_idx" ON "employee_sessions"("employee_id");
CREATE INDEX "employee_sessions_revoked_at_idx" ON "employee_sessions"("revoked_at");
CREATE INDEX "employee_sessions_expires_at_idx" ON "employee_sessions"("expires_at");
CREATE INDEX "fcm_tokens_employee_session_id_idx" ON "fcm_tokens"("employee_session_id");

ALTER TABLE "employee_sessions" ADD CONSTRAINT "employee_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_employee_session_id_fkey" FOREIGN KEY ("employee_session_id") REFERENCES "employee_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
