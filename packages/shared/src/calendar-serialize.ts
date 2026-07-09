import { format } from 'date-fns';

function toDateStr(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return format(v, 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

export function serializeCalendarEvent(event: Record<string, unknown>) {
  return {
    id: event.id,
    kind: event.kind,
    title: event.title,
    description: event.description ?? null,
    startDate: toDateStr(event.startDate),
    endDate: toDateStr(event.endDate),
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
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : (event.createdAt ? String(event.createdAt) : null),
    updatedAt: event.updatedAt instanceof Date ? event.updatedAt.toISOString() : (event.updatedAt ? String(event.updatedAt) : null),
  };
}
