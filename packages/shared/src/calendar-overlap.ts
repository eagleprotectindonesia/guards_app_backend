import { parseISO } from 'date-fns';

export interface EventOverlap {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

export interface QueryOverlap {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

function parseTime(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = parseISO(dateStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d;
}

export function overlapsEventRange(event: EventOverlap, query: QueryOverlap): boolean {
  if (event.startDate > query.endDate || event.endDate < query.startDate) {
    return false;
  }

  if (event.allDay || query.allDay) {
    return true;
  }

  if (!event.startTime || !event.endTime || !query.startTime || !query.endTime) {
    return true;
  }

  const eventStart = parseTime(event.startDate, event.startTime);
  const eventEnd = parseTime(event.endDate, event.endTime);
  const queryStart = parseTime(query.startDate, query.startTime);
  const queryEnd = parseTime(query.endDate, query.endTime);

  return eventStart < queryEnd && eventEnd > queryStart;
}
