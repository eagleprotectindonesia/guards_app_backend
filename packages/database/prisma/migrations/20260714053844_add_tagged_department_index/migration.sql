-- CreateIndex
CREATE INDEX "calendar_events_tagged_department_names_gin" ON "calendar_events" USING GIN ("tagged_department_names" array_ops);

-- CreateIndex
CREATE INDEX "calendar_events_dept_names_active_gin" ON "calendar_events" USING GIN ("tagged_department_names" array_ops) WHERE ("deleted_at" IS NULL);
