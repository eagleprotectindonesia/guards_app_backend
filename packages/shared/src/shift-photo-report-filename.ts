const TZ = 'Asia/Makassar';

type FilenameParams = {
  siteName: string | null | undefined;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  reportNumber: string | null;
  fallbackId: string;
};

function formatWitaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatWitaTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('hour')}-${get('minute')}`;
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

function extractReportCounter(reportNumber: string | null): string | null {
  if (!reportNumber) return null;
  const segments = reportNumber.split('-');
  const last = segments[segments.length - 1];
  if (last && /^\d{5}$/.test(last)) return last;
  return null;
}

export function buildShiftReportDownloadFilename(params: FilenameParams): string {
  const siteName = params.siteName ? sanitizeForFilename(params.siteName) : 'Unknown';
  const shiftDate = formatWitaDate(params.shiftStartsAt);
  const startTime = formatWitaTime(params.shiftStartsAt);
  const endTime = formatWitaTime(params.shiftEndsAt);
  const counter = extractReportCounter(params.reportNumber) ?? params.fallbackId.slice(0, 8).replace(/-+$/, '');
  const prefix = 'EP -';
  return `${prefix} ${siteName} - ${shiftDate} - ${startTime} to ${endTime} - RPT${counter}.pdf`;
}
