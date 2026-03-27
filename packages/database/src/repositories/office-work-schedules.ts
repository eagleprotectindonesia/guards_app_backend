import { db as prisma } from '../prisma/client';

export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Makassar';
export const DEFAULT_OFFICE_WORK_SCHEDULE_ID_SETTING = 'DEFAULT_OFFICE_WORK_SCHEDULE_ID';
export const DEFAULT_OFFICE_WORK_SCHEDULE_ID = '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80';
export const DEFAULT_OFFICE_WORK_SCHEDULE_CODE = 'default-office-work-schedule';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseOffsetMinutes(offsetText: string) {
  if (offsetText === 'GMT') return 0;

  const match = offsetText.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Unsupported timezone offset format: ${offsetText}`);
  }

  const [, sign, hours, minutes] = match;
  const totalMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
  return sign === '-' ? -totalMinutes : totalMinutes;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
  });

  const offset = formatter.formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
  if (!offset) {
    throw new Error(`Unable to resolve timezone offset for ${timeZone}`);
  }

  return parseOffsetMinutes(offset);
}

function getBusinessParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekdayText = parts.find(part => part.type === 'weekday')?.value;
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);

  if (!weekdayText || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error(`Unable to resolve business date parts for timezone ${timeZone}`);
  }

  return {
    weekday: WEEKDAY_MAP[weekdayText],
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function getUtcDateForBusinessLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMinutes * 60_000);
}

function addOneLocalDay(year: number, month: number, day: number) {
  const localDate = new Date(Date.UTC(year, month - 1, day));
  localDate.setUTCDate(localDate.getUTCDate() + 1);
  return {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
  };
}

export function parseTimeToMinutes(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${time}`);
  }

  const [, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: ${time}`);
  }

  return hour * 60 + minute;
}

export function getBusinessDayRange(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const parts = getBusinessParts(date, timeZone);
  const start = getUtcDateForBusinessLocal(parts.year, parts.month, parts.day, 0, 0, timeZone);
  const next = addOneLocalDay(parts.year, parts.month, parts.day);
  const end = getUtcDateForBusinessLocal(next.year, next.month, next.day, 0, 0, timeZone);

  return {
    timeZone,
    dateKey: parts.dateKey,
    weekday: parts.weekday,
    minutesSinceMidnight: parts.hour * 60 + parts.minute,
    start,
    end,
  };
}

export async function getOfficeWorkScheduleById(id: string) {
  return prisma.officeWorkSchedule.findUnique({
    where: { id },
    include: {
      days: {
        orderBy: { weekday: 'asc' },
      },
    },
  });
}

export async function getDefaultOfficeWorkSchedule() {
  const setting = await prisma.systemSetting.findUnique({
    where: { name: DEFAULT_OFFICE_WORK_SCHEDULE_ID_SETTING },
  });

  if (setting?.value) {
    const schedule = await getOfficeWorkScheduleById(setting.value);
    if (schedule) {
      return schedule;
    }
  }

  const fallback = await prisma.officeWorkSchedule.findUnique({
    where: { code: DEFAULT_OFFICE_WORK_SCHEDULE_CODE },
    include: {
      days: {
        orderBy: { weekday: 'asc' },
      },
    },
  });

  if (!fallback) {
    throw new Error('Default office work schedule is not configured');
  }

  return fallback;
}

export async function getOfficeWorkScheduleAssignmentForDate(employeeId: string, at = new Date()) {
  return prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
    include: {
      officeWorkSchedule: {
        include: {
          days: {
            orderBy: { weekday: 'asc' },
          },
        },
      },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });
}

export async function getCurrentOfficeWorkScheduleAssignment(employeeId: string, at = new Date()) {
  return getOfficeWorkScheduleAssignmentForDate(employeeId, at);
}

export async function getUpcomingOfficeWorkScheduleAssignment(employeeId: string, at = new Date()) {
  return prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { gt: at },
    },
    include: {
      officeWorkSchedule: true,
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });
}

export async function listOfficeWorkScheduleAssignments(employeeId: string) {
  return prisma.employeeOfficeWorkScheduleAssignment.findMany({
    where: { employeeId },
    include: {
      officeWorkSchedule: true,
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });
}

async function assertNoAssignmentOverlap(params: {
  employeeId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  excludeAssignmentId?: string;
}) {
  const overlapping = await prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      ...(params.excludeAssignmentId ? { id: { not: params.excludeAssignmentId } } : {}),
      effectiveFrom: { lt: params.effectiveUntil ?? new Date('9999-12-31T00:00:00.000Z') },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: params.effectiveFrom } }],
    },
  });

  if (overlapping) {
    throw new Error('Office work schedule assignment overlaps an existing assignment');
  }
}

export async function createOfficeWorkScheduleAssignment(params: {
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
}) {
  const { employeeId, officeWorkScheduleId, effectiveFrom, effectiveUntil = null } = params;

  if (effectiveUntil && effectiveUntil <= effectiveFrom) {
    throw new Error('effectiveUntil must be after effectiveFrom');
  }

  await assertNoAssignmentOverlap({ employeeId, effectiveFrom, effectiveUntil });

  return prisma.employeeOfficeWorkScheduleAssignment.create({
    data: {
      employeeId,
      officeWorkScheduleId,
      effectiveFrom,
      effectiveUntil,
    },
  });
}

export async function scheduleFutureOfficeWorkScheduleAssignment(params: {
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
}) {
  const { employeeId, officeWorkScheduleId, effectiveFrom } = params;

  const upcoming = await prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { gte: effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });

  if (upcoming) {
    throw new Error('A future office work schedule assignment already exists on or after the requested effective date');
  }

  const currentOrPrevious = await prisma.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lt: effectiveFrom },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveFrom } }],
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  await assertNoAssignmentOverlap({
    employeeId,
    effectiveFrom,
    effectiveUntil: null,
    excludeAssignmentId: currentOrPrevious?.id,
  });

  return prisma.$transaction(async tx => {
    if (currentOrPrevious) {
      await tx.employeeOfficeWorkScheduleAssignment.update({
        where: { id: currentOrPrevious.id },
        data: {
          effectiveUntil: effectiveFrom,
        },
      });
    }

    return tx.employeeOfficeWorkScheduleAssignment.create({
      data: {
        employeeId,
        officeWorkScheduleId,
        effectiveFrom,
      },
    });
  });
}

export async function resolveOfficeWorkScheduleForEmployee(employeeId: string, at = new Date()) {
  const assignment = await getOfficeWorkScheduleAssignmentForDate(employeeId, at);

  if (assignment) {
    return {
      schedule: assignment.officeWorkSchedule,
      assignment,
      source: 'assignment' as const,
    };
  }

  const schedule = await getDefaultOfficeWorkSchedule();
  return {
    schedule,
    assignment: null,
    source: 'default' as const,
  };
}

export async function resolveOfficeWorkScheduleContextForEmployee(employeeId: string, at = new Date()) {
  const resolved = await resolveOfficeWorkScheduleForEmployee(employeeId, at);
  const businessDay = getBusinessDayRange(at, BUSINESS_TIMEZONE);
  const dayRule = resolved.schedule.days.find(day => day.weekday === businessDay.weekday) ?? null;

  if (!dayRule) {
    throw new Error(`Office work schedule ${resolved.schedule.id} has no rule for weekday ${businessDay.weekday}`);
  }

  let startMinutes: number | null = null;
  let endMinutes: number | null = null;

  if (dayRule.isWorkingDay) {
    if (!dayRule.startTime || !dayRule.endTime) {
      throw new Error(`Office work schedule ${resolved.schedule.id} is missing hours for weekday ${businessDay.weekday}`);
    }

    startMinutes = parseTimeToMinutes(dayRule.startTime);
    endMinutes = parseTimeToMinutes(dayRule.endTime);

    if (endMinutes <= startMinutes) {
      throw new Error(`Office work schedule ${resolved.schedule.id} has invalid hours for weekday ${businessDay.weekday}`);
    }
  }

  return {
    ...resolved,
    dayRule,
    businessDay,
    startMinutes,
    endMinutes,
    isWorkingDay: dayRule.isWorkingDay,
    isLate: startMinutes != null && businessDay.minutesSinceMidnight > startMinutes,
    isAfterEnd: endMinutes != null && businessDay.minutesSinceMidnight > endMinutes,
  };
}
