-- CreateTable
CREATE TABLE "fcm_tokens" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fcm_tokens_token_key" ON "fcm_tokens"("token");

-- CreateIndex
CREATE INDEX "fcm_tokens_employee_id_idx" ON "fcm_tokens"("employee_id");

-- AddForeignKey
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
