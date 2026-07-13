export const BUSINESS_TIMEZONE = 'Asia/Makassar';

const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatDateKeyInTimeZone(date: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }

  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve date key for timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}
