import { BUSINESS_TIMEZONE, formatDateKeyInTimeZone } from './date-key';

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

function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const tzHour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const tzMinute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const tzMinutes = tzHour * 60 + tzMinute;

  let offset = tzMinutes - utcMinutes;
  if (offset < -720) offset += 1440;
  if (offset > 720) offset -= 1440;
  return offset;
}

export function parseTime(dateStr: string, timeStr: string, timeZone: string = BUSINESS_TIMEZONE): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const [year, month, day] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, h, m, 0, 0));
  const offset = getTimezoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
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

  const eventStart = parseTime(event.startDate, event.startTime, BUSINESS_TIMEZONE);
  const eventEnd = parseTime(event.endDate, event.endTime, BUSINESS_TIMEZONE);
  const queryStart = parseTime(query.startDate, query.startTime, BUSINESS_TIMEZONE);
  const queryEnd = parseTime(query.endDate, query.endTime, BUSINESS_TIMEZONE);

  return eventStart < queryEnd && eventEnd > queryStart;
}
