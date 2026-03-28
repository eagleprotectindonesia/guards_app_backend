import { db as prisma, Prisma } from '../prisma/client';

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

function subtractOneLocalDay(year: number, month: number, day: number) {
  const localDate = new Date(Date.UTC(year, month - 1, day));
  localDate.setUTCDate(localDate.getUTCDate() - 1);
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

function buildScheduleWindow(
  dayRule: {
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
  },
  dateParts: { year: number; month: number; day: number }
) {
  if (!dayRule.isWorkingDay || !dayRule.startTime || !dayRule.endTime) {
    return null;
  }

  const startMinutes = parseTimeToMinutes(dayRule.startTime);
  const endMinutes = parseTimeToMinutes(dayRule.endTime);

  if (endMinutes === startMinutes) {
    throw new Error('Office work schedule hours must not start and end at the same time');
  }

  const startAt = getUtcDateForBusinessLocal(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    Math.floor(startMinutes / 60),
    startMinutes % 60,
    BUSINESS_TIMEZONE
  );
  const endBase = endMinutes > startMinutes ? dateParts : addOneLocalDay(dateParts.year, dateParts.month, dateParts.day);
  const endAt = getUtcDateForBusinessLocal(
    endBase.year,
    endBase.month,
    endBase.day,
    Math.floor(endMinutes / 60),
    endMinutes % 60,
    BUSINESS_TIMEZONE
  );

  return {
    startMinutes,
    endMinutes,
    startAt,
    endAt,
  };
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

export async function getAllOfficeWorkSchedules() {
  return prisma.officeWorkSchedule.findMany({
    include: {
      days: {
        orderBy: { weekday: 'asc' },
      },
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
}

async function upsertOfficeWorkScheduleDays(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>
) {
  await Promise.all(
    days.map(day =>
      tx.officeWorkScheduleDay.upsert({
        where: {
          scheduleId_weekday: {
            scheduleId,
            weekday: day.weekday,
          },
        },
        update: {
          isWorkingDay: day.isWorkingDay,
          startTime: day.isWorkingDay ? day.startTime ?? null : null,
          endTime: day.isWorkingDay ? day.endTime ?? null : null,
        },
        create: {
          scheduleId,
          weekday: day.weekday,
          isWorkingDay: day.isWorkingDay,
          startTime: day.isWorkingDay ? day.startTime ?? null : null,
          endTime: day.isWorkingDay ? day.endTime ?? null : null,
        },
      })
    )
  );
}

export async function createOfficeWorkSchedule(params: {
  name: string;
  code: string;
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
}) {
  return prisma.$transaction(async tx => {
    const schedule = await tx.officeWorkSchedule.create({
      data: {
        name: params.name,
        code: params.code,
      },
    });

    await upsertOfficeWorkScheduleDays(tx, schedule.id, params.days);

    return tx.officeWorkSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
      include: {
        days: {
          orderBy: { weekday: 'asc' },
        },
      },
    });
  });
}

export async function updateOfficeWorkSchedule(params: {
  id: string;
  name: string;
  days: Array<{
    weekday: number;
    isWorkingDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
}) {
  return prisma.$transaction(async tx => {
    await tx.officeWorkSchedule.update({
      where: { id: params.id },
      data: {
        name: params.name,
      },
    });

    await upsertOfficeWorkScheduleDays(tx, params.id, params.days);

    return tx.officeWorkSchedule.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        days: {
          orderBy: { weekday: 'asc' },
        },
      },
    });
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

type AssignmentClient = Prisma.TransactionClient | typeof prisma;

type OfficeScheduleAuditActor =
  | { type: 'admin'; id: string }
  | { type: 'system'; id?: string | null }
  | { type: 'unknown'; id?: string | null };

function isSameEffectiveDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

async function logOfficeScheduleAssignmentChange(
  client: AssignmentClient,
  params: {
    employeeId: string;
    previousSchedule?: { id: string; name: string } | null;
    nextSchedule: { id: string; name: string };
    effectiveFrom: Date;
    effectiveUntil?: Date | null;
    action: 'CREATE' | 'UPDATE';
    operationType: 'create_future_assignment' | 'replace_same_date_assignment';
    source: 'single_update' | 'bulk_import';
    actor?: OfficeScheduleAuditActor;
  }
) {
  const employee = await client.employee.findUnique({
    where: { id: params.employeeId },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
    },
  });

  if (!employee) {
    throw new Error('Employee not found for office work schedule audit log');
  }

  await client.changelog.create({
    data: {
      action: params.action,
      entityType: 'Employee',
      entityId: employee.id,
      actor: (params.actor?.type ?? 'unknown') as 'admin' | 'system' | 'unknown',
      actorId: params.actor?.type === 'admin' ? params.actor.id : params.actor?.id ?? null,
      details: {
        name: 'Office Schedule Assignment',
        changeCategory: 'officeWorkScheduleAssignment',
        employeeName: employee.fullName,
        employeeNumber: employee.employeeNumber,
        previousScheduleId: params.previousSchedule?.id ?? null,
        previousScheduleName: params.previousSchedule?.name ?? null,
        nextScheduleId: params.nextSchedule.id,
        nextScheduleName: params.nextSchedule.name,
        effectiveFrom: params.effectiveFrom.toISOString(),
        effectiveUntil: params.effectiveUntil?.toISOString() ?? null,
        operationType: params.operationType,
        source: params.source,
        changes: {
          officeWorkScheduleName: {
            from: params.previousSchedule?.name ?? null,
            to: params.nextSchedule.name,
          },
          officeWorkScheduleId: {
            from: params.previousSchedule?.id ?? null,
            to: params.nextSchedule.id,
          },
        },
      },
    },
  });
}

export async function analyzeFutureOfficeWorkScheduleAssignment(params: {
  employeeId: string;
  officeWorkScheduleId: string;
  effectiveFrom: Date;
  referenceDate?: Date;
}, client: AssignmentClient = prisma) {
  const referenceDate = params.referenceDate ?? new Date();
  void referenceDate;
  const exactAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      effectiveFrom: params.effectiveFrom,
    },
  });

  if (exactAssignment) {
    return {
      mode:
        exactAssignment.officeWorkScheduleId === params.officeWorkScheduleId ? ('noop' as const) : ('replace' as const),
      exactAssignment,
      previousAssignment: null,
      nextAssignment: null,
    };
  }

  const previousAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      effectiveFrom: { lt: params.effectiveFrom },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: params.effectiveFrom } }],
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  const nextAssignment = await client.employeeOfficeWorkScheduleAssignment.findFirst({
    where: {
      employeeId: params.employeeId,
      effectiveFrom: { gt: params.effectiveFrom },
    },
    orderBy: {
      effectiveFrom: 'asc',
    },
  });

  return {
    mode: 'create' as const,
    exactAssignment: null,
    previousAssignment,
    nextAssignment,
  };
}

async function assertNoAssignmentOverlap(params: {
  employeeId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  excludeAssignmentId?: string;
}, client: AssignmentClient = prisma) {
  const overlapping = await client.employeeOfficeWorkScheduleAssignment.findFirst({
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

async function createFutureOfficeWorkScheduleAssignment(
  client: AssignmentClient,
  params: {
    employeeId: string;
    officeWorkScheduleId: string;
    effectiveFrom: Date;
    previousAssignment?: { id: string } | null;
    nextAssignment?: { effectiveFrom: Date } | null;
  }
) {
  const { employeeId, officeWorkScheduleId, effectiveFrom } = params;
  const currentOrPrevious =
    params.previousAssignment !== undefined
      ? params.previousAssignment
      : await client.employeeOfficeWorkScheduleAssignment.findFirst({
          where: {
            employeeId,
            effectiveFrom: { lt: effectiveFrom },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveFrom } }],
          },
          orderBy: {
            effectiveFrom: 'desc',
          },
        });
  const nextAssignment =
    params.nextAssignment !== undefined
      ? params.nextAssignment
      : await client.employeeOfficeWorkScheduleAssignment.findFirst({
          where: {
            employeeId,
            effectiveFrom: { gt: effectiveFrom },
          },
          orderBy: {
            effectiveFrom: 'asc',
          },
        });

  await assertNoAssignmentOverlap({
    employeeId,
    effectiveFrom,
    effectiveUntil: nextAssignment?.effectiveFrom ?? null,
    excludeAssignmentId: currentOrPrevious?.id,
  }, client);

  if (currentOrPrevious) {
    await client.employeeOfficeWorkScheduleAssignment.update({
      where: { id: currentOrPrevious.id },
      data: {
        effectiveUntil: effectiveFrom,
      },
    });
  }

  return client.employeeOfficeWorkScheduleAssignment.create({
    data: {
      employeeId,
      officeWorkScheduleId,
      effectiveFrom,
      effectiveUntil: nextAssignment?.effectiveFrom ?? null,
    },
  });
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
  actor?: OfficeScheduleAuditActor;
  source?: 'single_update' | 'bulk_import';
}) {
  const analysis = await analyzeFutureOfficeWorkScheduleAssignment(params);

  if (analysis.mode === 'noop') {
    return analysis.exactAssignment;
  }

  if (analysis.mode === 'replace' && analysis.exactAssignment) {
    const nextSchedule = await prisma.officeWorkSchedule.findUnique({
      where: { id: params.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    if (!nextSchedule) {
      throw new Error('Office work schedule not found');
    }

    const previousSchedule = await prisma.officeWorkSchedule.findUnique({
      where: { id: analysis.exactAssignment.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    const updatedAssignment = await prisma.employeeOfficeWorkScheduleAssignment.update({
      where: { id: analysis.exactAssignment.id },
      data: {
        officeWorkScheduleId: params.officeWorkScheduleId,
      },
    });

    await logOfficeScheduleAssignmentChange(prisma, {
      employeeId: params.employeeId,
      previousSchedule,
      nextSchedule,
      effectiveFrom: params.effectiveFrom,
      effectiveUntil: updatedAssignment.effectiveUntil,
      action: 'UPDATE',
      operationType: 'replace_same_date_assignment',
      source: params.source ?? 'single_update',
      actor: params.actor,
    });

    return updatedAssignment;
  }

  return prisma.$transaction(async tx => {
    const createdAssignment = await createFutureOfficeWorkScheduleAssignment(tx, {
      ...params,
      previousAssignment: analysis.previousAssignment,
      nextAssignment: analysis.nextAssignment,
    });
    const nextSchedule = await tx.officeWorkSchedule.findUnique({
      where: { id: params.officeWorkScheduleId },
      select: { id: true, name: true },
    });

    if (!nextSchedule) {
      throw new Error('Office work schedule not found');
    }

    await logOfficeScheduleAssignmentChange(tx, {
      employeeId: params.employeeId,
      previousSchedule: null,
      nextSchedule,
      effectiveFrom: params.effectiveFrom,
      effectiveUntil: createdAssignment.effectiveUntil,
      action: 'CREATE',
      operationType: 'create_future_assignment',
      source: params.source ?? 'single_update',
      actor: params.actor,
    });

    return createdAssignment;
  });
}

export async function bulkUpsertFutureOfficeWorkScheduleAssignments(
  assignments: Array<{
    employeeId: string;
    officeWorkScheduleId: string;
    effectiveFrom: Date;
  }>,
  options?: {
    actor?: OfficeScheduleAuditActor;
    source?: 'single_update' | 'bulk_import';
  }
) {
  return prisma.$transaction(async tx => {
    const results = [];
    const orderedAssignments = assignments
      .slice()
      .sort((left, right) => left.employeeId.localeCompare(right.employeeId) || left.effectiveFrom.getTime() - right.effectiveFrom.getTime());

    for (const assignment of orderedAssignments) {
      const analysis = await analyzeFutureOfficeWorkScheduleAssignment(assignment, tx);

      if (analysis.mode === 'noop') {
        results.push(analysis.exactAssignment);
        continue;
      }

      if (analysis.mode === 'replace' && analysis.exactAssignment) {
        const previousSchedule = await tx.officeWorkSchedule.findUnique({
          where: { id: analysis.exactAssignment.officeWorkScheduleId },
          select: { id: true, name: true },
        });
        const nextSchedule = await tx.officeWorkSchedule.findUnique({
          where: { id: assignment.officeWorkScheduleId },
          select: { id: true, name: true },
        });

        if (!nextSchedule) {
          throw new Error('Office work schedule not found');
        }

        const updated = await tx.employeeOfficeWorkScheduleAssignment.update({
          where: { id: analysis.exactAssignment.id },
          data: {
            officeWorkScheduleId: assignment.officeWorkScheduleId,
          },
        });

        await logOfficeScheduleAssignmentChange(tx, {
          employeeId: assignment.employeeId,
          previousSchedule,
          nextSchedule,
          effectiveFrom: assignment.effectiveFrom,
          effectiveUntil: updated.effectiveUntil,
          action: 'UPDATE',
          operationType: 'replace_same_date_assignment',
          source: options?.source ?? 'bulk_import',
          actor: options?.actor,
        });

        results.push(updated);
        continue;
      }

      const created = await createFutureOfficeWorkScheduleAssignment(tx, {
        ...assignment,
        previousAssignment: analysis.previousAssignment,
        nextAssignment: analysis.nextAssignment,
      });
      const nextSchedule = await tx.officeWorkSchedule.findUnique({
        where: { id: assignment.officeWorkScheduleId },
        select: { id: true, name: true },
      });

      if (!nextSchedule) {
        throw new Error('Office work schedule not found');
      }

      await logOfficeScheduleAssignmentChange(tx, {
        employeeId: assignment.employeeId,
        previousSchedule: null,
        nextSchedule,
        effectiveFrom: assignment.effectiveFrom,
        effectiveUntil: created.effectiveUntil,
        action: 'CREATE',
        operationType: 'create_future_assignment',
        source: options?.source ?? 'bulk_import',
        actor: options?.actor,
      });

      results.push(created);
    }

    return results;
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
  const currentParts = getBusinessParts(at, BUSINESS_TIMEZONE);
  const businessDay = getBusinessDayRange(at, BUSINESS_TIMEZONE);
  const dayRule = resolved.schedule.days.find(day => day.weekday === businessDay.weekday) ?? null;
  const previousDayRule = resolved.schedule.days.find(day => day.weekday === ((businessDay.weekday + 6) % 7)) ?? null;

  if (!dayRule) {
    throw new Error(`Office work schedule ${resolved.schedule.id} has no rule for weekday ${businessDay.weekday}`);
  }

  const currentWindow = buildScheduleWindow(dayRule, currentParts);
  const previousDayParts = subtractOneLocalDay(currentParts.year, currentParts.month, currentParts.day);
  const previousWindow =
    previousDayRule && previousDayRule.isWorkingDay && previousDayRule.startTime && previousDayRule.endTime
      ? buildScheduleWindow(previousDayRule, previousDayParts)
      : null;

  const previousWindowActive =
    previousWindow != null &&
    previousWindow.endMinutes < previousWindow.startMinutes &&
    at.getTime() >= previousWindow.startAt.getTime() &&
    at.getTime() <= previousWindow.endAt.getTime();

  const activeWindow = previousWindowActive ? previousWindow : currentWindow;

  return {
    ...resolved,
    dayRule,
    businessDay,
    startMinutes: activeWindow?.startMinutes ?? null,
    endMinutes: activeWindow?.endMinutes ?? null,
    windowStart: activeWindow?.startAt ?? null,
    windowEnd: activeWindow?.endAt ?? null,
    isWorkingDay: Boolean(currentWindow || previousWindowActive),
    isLate: activeWindow != null && at.getTime() > activeWindow.startAt.getTime(),
    isAfterEnd: activeWindow != null && at.getTime() > activeWindow.endAt.getTime(),
  };
}
