import { computeReminderScheduledAt, formatDateKeyInTimeZone, overlapsEventRange } from '@repo/shared';
import { db as prisma, Prisma } from '../prisma/client';
import { BUSINESS_TIMEZONE } from './office-work-schedules';

type TxLike = Prisma.TransactionClient | typeof prisma;

function dateKeyToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export type CalendarEventCreator = { type: 'employee'; id: string } | { type: 'admin'; id: string };

export type CalendarEventOwner = { type: 'employee'; id: string } | { type: 'admin'; id: string };

export type CalendarEventChangelogActor =
  | { type: 'admin'; id: string }
  | { type: 'employee'; id: string }
  | { type: 'system' };

export interface CreateCalendarEventInput {
  employeeId?: string;
  adminId?: string;
  kind: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  clientName?: string;
  trainerName?: string;
  priority?: string;
  reminderMinutesBefore?: number | null;
  taggedEmployeeIds?: string[];
  taggedAdminIds?: string[];
  taggedDepartmentNames?: string[];
}

export interface CalendarReminderCandidate {
  id: string;
  employeeId: string | null;
  adminId: string | null;
  title: string;
  startDate: Date;
  startTime: string | null;
  reminderMinutesBefore: number | null;
  tags: { id: string; participantType: string; employeeId: string | null; adminId: string | null }[];
}

export interface UpdateCalendarEventInput {
  kind?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  clientName?: string;
  trainerName?: string;
  priority?: string;
  reminderMinutesBefore?: number | null;
  taggedEmployeeIds?: string[];
  taggedAdminIds?: string[];
  taggedDepartmentNames?: string[];
}

export interface ListCalendarEventsParams {
  fromDate: Date;
  toDate: Date;
  employeeId?: string;
  adminId?: string;
  employeeIds?: string[];
  kinds?: string[];
  search?: string;
  priority?: string[];
  clientName?: string;
  taggedUserId?: string;
  taggedDepartmentName?: string;
  includeTags?: boolean;
  includeOwner?: boolean;
  includeAllAdminEvents?: boolean;
  tx?: TxLike;
}

export async function createCalendarEvent(input: CreateCalendarEventInput, tx: TxLike = prisma) {
  const { taggedEmployeeIds, taggedAdminIds, taggedDepartmentNames, ...eventData } = input;
  const hasReminder = eventData.reminderMinutesBefore !== null && eventData.reminderMinutesBefore !== undefined;
  const event = await tx.calendarEvent.create({
    data: {
      employeeId: eventData.employeeId ?? null,
      adminId: eventData.adminId ?? null,
      kind: eventData.kind as any,
      title: eventData.title,
      description: eventData.description ?? null,
      startDate: dateKeyToDate(eventData.startDate),
      endDate: dateKeyToDate(eventData.endDate),
      startTime: eventData.startTime ?? null,
      endTime: eventData.endTime ?? null,
      allDay: eventData.allDay,
      location: eventData.location ?? null,
      latitude: eventData.latitude ?? null,
      longitude: eventData.longitude ?? null,
      clientName: eventData.clientName ?? null,
      trainerName: eventData.trainerName ?? null,
      taggedDepartmentNames: taggedDepartmentNames ?? [],
      priority: eventData.priority ?? null,
      reminderMinutesBefore: hasReminder ? eventData.reminderMinutesBefore! : null,
      reminderScheduledAt: hasReminder
        ? computeReminderScheduledAt(eventData.startDate, eventData.startTime ?? null, eventData.reminderMinutesBefore!)
        : null,
    },
  });

  if (taggedEmployeeIds?.length || taggedAdminIds?.length) {
    for (const empId of taggedEmployeeIds ?? []) {
      await tx.calendarEventTag.create({
        data: { eventId: event.id, participantType: 'employee', employeeId: empId },
      });
    }
    for (const adId of taggedAdminIds ?? []) {
      await tx.calendarEventTag.create({
        data: { eventId: event.id, participantType: 'admin', adminId: adId },
      });
    }
  }

  return event;
}

export async function updateCalendarEvent(id: string, input: UpdateCalendarEventInput, tx: TxLike = prisma) {
  const { taggedEmployeeIds, taggedAdminIds, taggedDepartmentNames, ...eventData } = input;
  const data: Record<string, unknown> = {};
  if (eventData.kind !== undefined) data.kind = eventData.kind;
  if (eventData.title !== undefined) data.title = eventData.title;
  if (eventData.description !== undefined) data.description = eventData.description;
  if (eventData.startDate !== undefined) data.startDate = dateKeyToDate(eventData.startDate);
  if (eventData.endDate !== undefined) data.endDate = dateKeyToDate(eventData.endDate);
  if (eventData.startTime !== undefined) data.startTime = eventData.startTime;
  if (eventData.endTime !== undefined) data.endTime = eventData.endTime;
  if (eventData.allDay !== undefined) {
    data.allDay = eventData.allDay;
    if (eventData.allDay === true) {
      data.startTime = null;
      data.endTime = null;
    }
  }
  if (eventData.location !== undefined) data.location = eventData.location;
  if (eventData.latitude !== undefined) data.latitude = eventData.latitude;
  if (eventData.longitude !== undefined) data.longitude = eventData.longitude;
  if (eventData.clientName !== undefined) data.clientName = eventData.clientName;
  if (eventData.trainerName !== undefined) data.trainerName = eventData.trainerName;
  if (eventData.priority !== undefined) data.priority = eventData.priority;
  if (taggedDepartmentNames !== undefined) data.taggedDepartmentNames = taggedDepartmentNames;

  const schedulingChanged =
    eventData.startDate !== undefined ||
    eventData.startTime !== undefined ||
    eventData.reminderMinutesBefore !== undefined;

  if (eventData.reminderMinutesBefore !== undefined) {
    data.reminderMinutesBefore = eventData.reminderMinutesBefore;
  }

  if (schedulingChanged) {
    const current = await tx.calendarEvent.findUnique({
      where: { id },
      select: { startDate: true, startTime: true, reminderMinutesBefore: true },
    });
    const resolvedMinutesBefore =
      eventData.reminderMinutesBefore !== undefined
        ? eventData.reminderMinutesBefore
        : (current?.reminderMinutesBefore ?? null);
    const resolvedStartDate =
      eventData.startDate ?? (current?.startDate ? String(current.startDate).slice(0, 10) : null);
    if (resolvedMinutesBefore !== null && resolvedMinutesBefore !== undefined && resolvedStartDate) {
      const resolvedStartTime = eventData.startTime !== undefined ? eventData.startTime : (current?.startTime ?? null);
      data.reminderScheduledAt = computeReminderScheduledAt(
        resolvedStartDate,
        resolvedStartTime,
        resolvedMinutesBefore
      );
      data.reminderSentAt = null;
    } else if (eventData.reminderMinutesBefore === null) {
      data.reminderScheduledAt = null;
      data.reminderSentAt = null;
    }
  }

  const event = await tx.calendarEvent.update({
    where: { id },
    data: data as any,
  });

  if (taggedEmployeeIds !== undefined || taggedAdminIds !== undefined) {
    await tx.calendarEventTag.deleteMany({ where: { eventId: id } });
    for (const empId of taggedEmployeeIds ?? []) {
      await tx.calendarEventTag.create({
        data: { eventId: id, participantType: 'employee', employeeId: empId },
      });
    }
    for (const adId of taggedAdminIds ?? []) {
      await tx.calendarEventTag.create({
        data: { eventId: id, participantType: 'admin', adminId: adId },
      });
    }
  }

  return event;
}

export async function deleteCalendarEvent(id: string, tx: TxLike = prisma) {
  return tx.calendarEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getCalendarEventById(id: string, tx: TxLike = prisma) {
  return tx.calendarEvent.findFirst({
    where: { id, deletedAt: null },
    include: {
      employee: { select: { id: true, fullName: true } },
      admin: { select: { id: true, name: true } },
    },
  });
}

export async function listCalendarEvents(params: ListCalendarEventsParams) {
  const {
    fromDate,
    toDate,
    employeeId,
    adminId,
    employeeIds,
    kinds,
    search,
    priority,
    clientName,
    taggedUserId,
    taggedDepartmentName,
    includeTags,
    includeOwner,
    includeAllAdminEvents,
    tx = prisma,
  } = params;

  const where: Prisma.CalendarEventWhereInput = {
    deletedAt: null,
    endDate: { gte: fromDate },
    startDate: { lte: toDate },
  };

  const orClauses: Prisma.CalendarEventWhereInput[] = [];

  if (employeeId) {
    orClauses.push({ employeeId }, { tags: { some: { employeeId, participantType: 'employee' as const } } });
  }

  if (includeAllAdminEvents) {
    orClauses.push({ adminId: { not: null } });
  } else if (adminId) {
    orClauses.push({ adminId }, { tags: { some: { adminId, participantType: 'admin' as const } } });
  }

  if (employeeIds && employeeIds.length > 0) {
    orClauses.push({ employeeId: { in: employeeIds } });
  }

  if (orClauses.length > 0) {
    where.OR = orClauses;
  }

  if (kinds && kinds.length > 0) {
    where.kind = { in: kinds as any };
  }

  if (search) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  if (priority && priority.length > 0) {
    where.priority = { in: priority };
  }

  if (clientName) {
    where.clientName = { contains: clientName, mode: 'insensitive' };
  }

  if (taggedUserId) {
    where.tags = {
      some: {
        OR: [
          { employeeId: taggedUserId, participantType: 'employee' },
          { adminId: taggedUserId, participantType: 'admin' },
        ],
      },
    };
  }

  if (taggedDepartmentName) {
    where.taggedDepartmentNames = { has: taggedDepartmentName };
  }

  return tx.calendarEvent.findMany({
    where,
    orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    include: {
      ...(includeTags
        ? {
            tags: {
              include: {
                employee: { select: { id: true, fullName: true, employeeNumber: true } },
                admin: { select: { id: true, name: true, email: true } },
              },
            },
          }
        : {}),
      ...(includeOwner
        ? {
            employee: { select: { id: true, fullName: true } },
            admin: { select: { id: true, name: true } },
          }
        : {}),
    },
  });
}

export async function listEmployeeCalendarEvents(
  employeeId: string,
  fromDate: Date,
  toDate: Date,
  departmentName?: string,
  tx: TxLike = prisma
) {
  return tx.calendarEvent.findMany({
    where: {
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
      OR: [
        { employeeId },
        { tags: { some: { employeeId, participantType: 'employee' } } },
        ...(departmentName ? [{ taggedDepartmentNames: { has: departmentName } }] : []),
      ],
    },
    orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    include: {
      employee: { select: { id: true, fullName: true } },
      admin: { select: { id: true, name: true } },
    },
  });
}

export async function listCalendarEventsForDepartmentMembers(
  departmentNames: string[],
  fromDate: Date,
  toDate: Date,
  tx: TxLike = prisma
) {
  if (departmentNames.length === 0) return [];
  return tx.calendarEvent.findMany({
    where: {
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
      taggedDepartmentNames: { hasSome: departmentNames },
    },
    orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    include: {
      employee: { select: { id: true, fullName: true } },
      admin: { select: { id: true, name: true } },
      tags: {
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          admin: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export interface CalendarDaySummaryParams {
  fromDate: Date;
  toDate: Date;
  employeeId?: string;
  employeeIds?: string[];
  adminId?: string;
  kinds?: string[];
  priority?: string[];
  clientName?: string;
  taggedUserId?: string;
  taggedDepartmentName?: string;
  includeAllAdminEvents?: boolean;
  tx?: TxLike;
}

export async function listCalendarDaySummary(params: CalendarDaySummaryParams) {
  const {
    fromDate,
    toDate,
    employeeId,
    employeeIds,
    adminId,
    kinds,
    priority,
    clientName,
    taggedUserId,
    taggedDepartmentName,
    includeAllAdminEvents,
    tx = prisma,
  } = params;

  const where: Prisma.CalendarEventWhereInput = {
    deletedAt: null,
    endDate: { gte: fromDate },
    startDate: { lte: toDate },
  };

  const orClauses: Prisma.CalendarEventWhereInput[] = [];

  if (employeeId) {
    orClauses.push({ employeeId });
  }

  if (includeAllAdminEvents) {
    orClauses.push({ adminId: { not: null } });
  } else if (adminId) {
    orClauses.push({ adminId }, { tags: { some: { adminId, participantType: 'admin' as const } } });
  }

  if (employeeIds && employeeIds.length > 0) {
    orClauses.push({ employeeId: { in: employeeIds } });
  }

  if (orClauses.length > 0) {
    where.OR = orClauses;
  }

  if (kinds && kinds.length > 0) {
    where.kind = { in: kinds as any };
  }

  if (priority && priority.length > 0) {
    where.priority = { in: priority };
  }

  if (clientName) {
    where.clientName = { contains: clientName, mode: 'insensitive' };
  }

  if (taggedUserId) {
    where.tags = {
      some: {
        OR: [
          { employeeId: taggedUserId, participantType: 'employee' },
          { adminId: taggedUserId, participantType: 'admin' },
        ],
      },
    };
  }

  if (taggedDepartmentName) {
    where.taggedDepartmentNames = { has: taggedDepartmentName };
  }

  const rows = await tx.calendarEvent.groupBy({
    by: ['startDate'],
    where,
    _count: { id: true },
    orderBy: { startDate: 'asc' },
  });

  return rows.map(r => ({
    date: formatDateKeyInTimeZone(r.startDate, BUSINESS_TIMEZONE),
    count: r._count.id,
  }));
}

export async function getCalendarEventTagsRaw(eventId: string, tx: TxLike = prisma) {
  return tx.calendarEventTag.findMany({
    where: { eventId },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getCalendarEventReminderCandidates(now: Date, tx: TxLike = prisma) {
  return tx.calendarEvent.findMany({
    where: {
      deletedAt: null,
      reminderScheduledAt: { lte: now },
      reminderSentAt: null,
      reminderMinutesBefore: { not: null },
    },
    select: {
      id: true,
      employeeId: true,
      adminId: true,
      title: true,
      startDate: true,
      startTime: true,
      reminderMinutesBefore: true,
      tags: {
        select: {
          id: true,
          participantType: true,
          employeeId: true,
          adminId: true,
        },
      },
    },
    orderBy: { reminderScheduledAt: 'asc' },
  });
}

export async function claimCalendarEventReminders(eventIds: string[], now: Date, tx: TxLike = prisma) {
  if (eventIds.length === 0) return 0;
  const result = await tx.calendarEvent.updateMany({
    where: { id: { in: eventIds }, reminderSentAt: null },
    data: { reminderSentAt: now },
  });
  return result.count;
}

export type ParticipantRef = { type: 'employee' | 'admin'; id: string };
export type ParticipantKey = `${'employee' | 'admin'}:${string}`;

function toParticipantKey(p: ParticipantRef): ParticipantKey {
  return `${p.type}:${p.id}`;
}

export interface AvailabilityConflict {
  id: string;
  title: string;
  kind: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  ownerType: 'employee' | 'admin';
  ownerId: string;
}

export interface FindAvailabilityParams {
  participants: ParticipantRef[];
  fromDate: string;
  toDate: string;
  allDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  excludeEventId?: string;
  tx?: TxLike;
}

export async function findParticipantAvailabilityConflicts(
  params: FindAvailabilityParams
): Promise<Record<ParticipantKey, AvailabilityConflict[]>> {
  const { participants, fromDate, toDate, allDay, startTime, endTime, excludeEventId, tx = prisma } = params;

  if (participants.length === 0) return {};

  const empIds = participants.filter(p => p.type === 'employee').map(p => p.id);
  const adminIds = participants.filter(p => p.type === 'admin').map(p => p.id);

  const participantMap = new Map<ParticipantKey, ParticipantRef>();
  for (const p of participants) {
    participantMap.set(toParticipantKey(p), p);
  }

  const orClauses: Prisma.CalendarEventWhereInput[] = [];

  if (empIds.length > 0) {
    orClauses.push(
      { employeeId: { in: empIds } },
      { tags: { some: { employeeId: { in: empIds }, participantType: 'employee' } } }
    );
  }

  if (adminIds.length > 0) {
    orClauses.push(
      { adminId: { in: adminIds } },
      { tags: { some: { adminId: { in: adminIds }, participantType: 'admin' } } }
    );
  }

  const where: Prisma.CalendarEventWhereInput = {
    deletedAt: null,
    endDate: { gte: fromDate },
    startDate: { lte: toDate },
    OR: orClauses,
  };

  if (excludeEventId) {
    where.NOT = { id: excludeEventId };
  }

  const rows = await tx.calendarEvent.findMany({
    where,
    select: {
      id: true,
      kind: true,
      title: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      allDay: true,
      employeeId: true,
      adminId: true,
      tags: {
        select: {
          id: true,
          participantType: true,
          employeeId: true,
          adminId: true,
        },
      },
    },
    orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
  });

  const result: Record<ParticipantKey, AvailabilityConflict[]> = {};
  for (const p of participants) {
    result[toParticipantKey(p)] = [];
  }

  for (const row of rows) {
    const relevantParticipants: ParticipantRef[] = [];

    if (row.employeeId && empIds.includes(row.employeeId)) {
      relevantParticipants.push({ type: 'employee', id: row.employeeId });
    }
    if (row.adminId && adminIds.includes(row.adminId)) {
      relevantParticipants.push({ type: 'admin', id: row.adminId });
    }

    for (const tag of row.tags) {
      if (tag.participantType === 'employee' && tag.employeeId && empIds.includes(tag.employeeId)) {
        relevantParticipants.push({ type: 'employee', id: tag.employeeId });
      }
      if (tag.participantType === 'admin' && tag.adminId && adminIds.includes(tag.adminId)) {
        relevantParticipants.push({ type: 'admin', id: tag.adminId });
      }
    }

    const ownerType: 'employee' | 'admin' = row.adminId ? 'admin' : 'employee';
    const ownerId = (row.adminId ?? row.employeeId) as string;

    const conflict: AvailabilityConflict = {
      id: row.id,
      kind: row.kind,
      title: row.title,
      startDate: formatDateKeyInTimeZone(row.startDate, BUSINESS_TIMEZONE),
      endDate: formatDateKeyInTimeZone(row.endDate, BUSINESS_TIMEZONE),
      startTime: row.startTime,
      endTime: row.endTime,
      allDay: row.allDay,
      ownerType,
      ownerId,
    };

    for (const p of relevantParticipants) {
      const key = toParticipantKey(p);

      if (result[key].some(c => c.id === conflict.id)) {
        continue;
      }

      const eventOverlap = {
        startDate: conflict.startDate,
        endDate: conflict.endDate,
        startTime: conflict.startTime,
        endTime: conflict.endTime,
        allDay: conflict.allDay,
      };
      const queryOverlap = {
        startDate: fromDate,
        endDate: toDate,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        allDay,
      };

      if (overlapsEventRange(eventOverlap, queryOverlap)) {
        result[key].push(conflict);
      }
    }
  }

  return result;
}

export async function createCalendarEventWithChangelog(
  input: CreateCalendarEventInput,
  actor: CalendarEventChangelogActor,
  tx: TxLike = prisma,
) {
  const event = await createCalendarEvent(input, tx);

  const actorData =
    actor.type === 'admin' ? { actor: 'admin' as const, actorId: actor.id }
      : actor.type === 'employee' ? { actor: 'employee' as const, employeeId: actor.id }
        : { actor: 'system' as const };

  await (tx as any).changelog.create({
    data: {
      action: 'CREATE',
      entityType: 'CalendarEvent',
      entityId: event.id,
      details: {
        kind: input.kind,
        title: input.title,
        startDate: input.startDate,
        endDate: input.endDate,
        allDay: input.allDay,
        priority: input.priority ?? 'normal',
        taggedEmployeeIds: input.taggedEmployeeIds ?? [],
        taggedAdminIds: input.taggedAdminIds ?? [],
        taggedDepartmentNames: input.taggedDepartmentNames ?? [],
      },
      ...actorData,
    },
  });

  return event;
}

export async function updateCalendarEventWithChangelog(
  id: string,
  input: UpdateCalendarEventInput,
  actor: CalendarEventChangelogActor,
  tx: TxLike = prisma,
) {
  const existing = await tx.calendarEvent.findUnique({ where: { id } });
  if (!existing) throw new Error(`CalendarEvent not found: ${id}`);

  const existingTags = await tx.calendarEventTag.findMany({
    where: { eventId: id },
    select: { employeeId: true, adminId: true, participantType: true },
  });
  const existingEmpTags = existingTags.filter(t => t.participantType === 'employee').map(t => t.employeeId!).filter(Boolean);
  const existingAdmTags = existingTags.filter(t => t.participantType === 'admin').map(t => t.adminId!).filter(Boolean);
  const existingDeptNames = existing.taggedDepartmentNames as string[] ?? [];

  const event = await updateCalendarEvent(id, input, tx);

  const diff: Record<string, { from: unknown; to: unknown }> = {};

  const scalarFields: (keyof UpdateCalendarEventInput)[] = [
    'kind', 'title', 'description', 'startDate', 'endDate', 'startTime', 'endTime',
    'allDay', 'location', 'latitude', 'longitude', 'clientName', 'trainerName', 'priority', 'reminderMinutesBefore',
  ];

  for (const field of scalarFields) {
    if (input[field] !== undefined) {
      const existingVal = (existing as any)[field];
      let inputVal: unknown = input[field];

      if (field === 'startDate' || field === 'endDate') {
        const existingStr = existingVal instanceof Date
          ? existingVal.toISOString().slice(0, 10)
          : String(existingVal);
        const inputStr = String(inputVal);
        if (existingStr !== inputStr) {
          diff[field] = { from: existingStr, to: inputStr };
        }
      } else {
        if (existingVal !== inputVal) {
          diff[field] = { from: existingVal ?? null, to: inputVal ?? null };
        }
      }
    }
  }

  const tagDiff: Record<string, string[]> = {};
  if (input.taggedEmployeeIds !== undefined) {
    const added = input.taggedEmployeeIds.filter(id => !existingEmpTags.includes(id));
    const removed = existingEmpTags.filter(id => !input.taggedEmployeeIds!.includes(id));
    if (added.length > 0) tagDiff.addedEmployees = added;
    if (removed.length > 0) tagDiff.removedEmployees = removed;
  }
  if (input.taggedAdminIds !== undefined) {
    const added = input.taggedAdminIds.filter(id => !existingAdmTags.includes(id));
    const removed = existingAdmTags.filter(id => !input.taggedAdminIds!.includes(id));
    if (added.length > 0) tagDiff.addedAdmins = added;
    if (removed.length > 0) tagDiff.removedAdmins = removed;
  }

  if (input.taggedDepartmentNames !== undefined) {
    const added = input.taggedDepartmentNames.filter(name => !existingDeptNames.includes(name));
    const removed = existingDeptNames.filter(name => !input.taggedDepartmentNames!.includes(name));
    if (added.length > 0) tagDiff.addedDepartmentNames = added;
    if (removed.length > 0) tagDiff.removedDepartmentNames = removed;
  }

  if (Object.keys(diff).length === 0 && Object.keys(tagDiff).length === 0) {
    return event;
  }

  const actorData =
    actor.type === 'admin' ? { actor: 'admin' as const, actorId: actor.id }
      : actor.type === 'employee' ? { actor: 'employee' as const, employeeId: actor.id }
        : { actor: 'system' as const };

  const details: Record<string, unknown> = {
    changedFields: Object.keys(diff),
    diff,
  };
  if (Object.keys(tagDiff).length > 0) {
    details.tagDiff = tagDiff;
  }

  await (tx as any).changelog.create({
    data: {
      action: 'UPDATE',
      entityType: 'CalendarEvent',
      entityId: id,
      details,
      ...actorData,
    },
  });

  return event;
}

export async function deleteCalendarEventWithChangelog(
  id: string,
  actor: CalendarEventChangelogActor,
  tx: TxLike = prisma,
) {
  const event = await tx.calendarEvent.findUnique({
    where: { id },
    select: { title: true, kind: true, startDate: true, endDate: true },
  });

  await deleteCalendarEvent(id, tx);

  const actorData =
    actor.type === 'admin' ? { actor: 'admin' as const, actorId: actor.id }
      : actor.type === 'employee' ? { actor: 'employee' as const, employeeId: actor.id }
        : { actor: 'system' as const };

  await (tx as any).changelog.create({
    data: {
      action: 'DELETE',
      entityType: 'CalendarEvent',
      entityId: id,
      details: event
        ? {
          title: event.title,
          kind: event.kind,
          startDate: event.startDate instanceof Date ? event.startDate.toISOString().slice(0, 10) : event.startDate,
          endDate: event.endDate instanceof Date ? event.endDate.toISOString().slice(0, 10) : event.endDate,
        }
        : undefined,
      ...actorData,
    },
  });
}

export async function listCalendarEventChangelogs(
  eventId: string,
  params?: { limit?: number; cursor?: string },
  tx: TxLike = prisma,
) {
  const limit = params?.limit ?? 50;
  const where: any = { entityType: 'CalendarEvent', entityId: eventId };

  if (params?.cursor) {
    const cursorItem = await tx.changelog.findUnique({
      where: { id: params.cursor },
      select: { createdAt: true },
    });
    if (cursorItem) {
      where.createdAt = { lt: cursorItem.createdAt };
    }
  }

  const items = await (tx as any).changelog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      admin: { select: { id: true, name: true } },
      employee: { select: { id: true, fullName: true } },
    },
  });

  const hasMore = items.length > limit;
  const rows = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].id : null;

  return { items: rows, nextCursor };
}
