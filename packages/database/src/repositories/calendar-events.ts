import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

function dateKeyToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export type CalendarEventCreator = { type: 'employee'; id: string } | { type: 'admin'; id: string };

export type CalendarEventOwner = { type: 'employee'; id: string } | { type: 'admin'; id: string };

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
  clientName?: string;
  trainerName?: string;
  priority?: string;
  color?: string;
  taggedEmployeeIds?: string[];
  taggedAdminIds?: string[];
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
  clientName?: string;
  trainerName?: string;
  priority?: string;
  color?: string;
  taggedEmployeeIds?: string[];
  taggedAdminIds?: string[];
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
  includeTags?: boolean;
  includeOwner?: boolean;
  tx?: TxLike;
}

export async function createCalendarEvent(input: CreateCalendarEventInput, tx: TxLike = prisma) {
  const { taggedEmployeeIds, taggedAdminIds, ...eventData } = input;
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
      clientName: eventData.clientName ?? null,
      trainerName: eventData.trainerName ?? null,
      priority: eventData.priority ?? null,
      color: eventData.color ?? null,
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
  const { taggedEmployeeIds, taggedAdminIds, ...eventData } = input;
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
  if (eventData.clientName !== undefined) data.clientName = eventData.clientName;
  if (eventData.trainerName !== undefined) data.trainerName = eventData.trainerName;
  if (eventData.priority !== undefined) data.priority = eventData.priority;
  if (eventData.color !== undefined) data.color = eventData.color;

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
    includeTags,
    includeOwner,
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

  if (adminId) {
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
  tx: TxLike = prisma
) {
  return tx.calendarEvent.findMany({
    where: {
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
      OR: [{ employeeId }, { tags: { some: { employeeId, participantType: 'employee' } } }],
    },
    orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    include: {
      employee: { select: { id: true, fullName: true } },
      admin: { select: { id: true, name: true } },
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

  if (adminId) {
    orClauses.push({ adminId });
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

  const rows = await tx.calendarEvent.groupBy({
    by: ['startDate'],
    where,
    _count: { id: true },
    orderBy: { startDate: 'asc' },
  });

  return rows.map(r => ({
    date: r.startDate.toISOString().slice(0, 10),
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
