import { BUSINESS_TIMEZONE } from '@repo/database';

type ResolveContextFn = (employeeId: string, at: Date) => Promise<{
  windowEnd: Date | null;
  windowStart?: Date | null;
  source?: string;
  [key: string]: unknown;
}>;

type GetScheduledPaidMinutesFn = (employeeId: string, at: Date) => Promise<number>;

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function buildCachedAttendanceContextResolvers(params: {
  resolveContext: ResolveContextFn;
  getScheduledPaidMinutes: GetScheduledPaidMinutesFn;
}) {
  const contextCache = new Map<string, Awaited<ReturnType<ResolveContextFn>>>();
  const paidMinutesCache = new Map<string, number>();
  const inflightContext = new Map<string, Promise<Awaited<ReturnType<ResolveContextFn>>>>();
  const inflightPaid = new Map<string, Promise<number>>();

  const cacheKey = (employeeId: string, at: Date) => `${employeeId}|${getDateKeyInTimeZone(at, BUSINESS_TIMEZONE)}`;

  const resolveContextCached: ResolveContextFn = async (employeeId, at) => {
    const key = cacheKey(employeeId, at);
    if (contextCache.has(key)) {
      return contextCache.get(key) as never;
    }
    const inflight = inflightContext.get(key);
    if (inflight) return inflight as never;

    const promise = params.resolveContext(employeeId, at).then(value => {
      contextCache.set(key, value as never);
      inflightContext.delete(key);
      return value;
    });
    inflightContext.set(key, promise as never);
    return promise as never;
  };

  const getScheduledPaidMinutesCached: GetScheduledPaidMinutesFn = async (employeeId, at) => {
    const key = cacheKey(employeeId, at);
    if (paidMinutesCache.has(key)) {
      return paidMinutesCache.get(key) as number;
    }
    const inflight = inflightPaid.get(key);
    if (inflight) return inflight;

    const promise = params.getScheduledPaidMinutes(employeeId, at).then(value => {
      paidMinutesCache.set(key, value);
      inflightPaid.delete(key);
      return value;
    });
    inflightPaid.set(key, promise);
    return promise;
  };

  return {
    resolveContext: resolveContextCached,
    getScheduledPaidMinutes: getScheduledPaidMinutesCached,
  };
}
