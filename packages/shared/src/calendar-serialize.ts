export function serializeCalendarEvent(event: Record<string, unknown>) {
  return {
    id: event.id,
    kind: event.kind,
    title: event.title,
    description: event.description ?? null,
    startDate: event.startDate ? String(event.startDate).slice(0, 10) : null,
    endDate: event.endDate ? String(event.endDate).slice(0, 10) : null,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    allDay: event.allDay ?? false,
    reminderMinutesBefore: event.reminderMinutesBefore ?? null,
    location: event.location ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    clientName: event.clientName ?? null,
    trainerName: event.trainerName ?? null,
    priority: event.priority ?? null,
    color: event.color ?? null,
    createdAt: event.createdAt ? String(event.createdAt) : null,
    updatedAt: event.updatedAt ? String(event.updatedAt) : null,
  };
}
