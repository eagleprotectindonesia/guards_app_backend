import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

function dateKeyToDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export async function createCalendarEvent(
  input: {
    employeeId: string;
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
  },
  tx: TxLike = prisma
) {
  return tx.calendarEvent.create({
    data: {
      employeeId: input.employeeId,
      kind: input.kind as any,
      title: input.title,
      description: input.description ?? null,
      startDate: dateKeyToDate(input.startDate),
      endDate: dateKeyToDate(input.endDate),
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      allDay: input.allDay,
      location: input.location ?? null,
      clientName: input.clientName ?? null,
      trainerName: input.trainerName ?? null,
      priority: input.priority ?? null,
      color: input.color ?? null,
    },
  });
}

export async function updateCalendarEvent(
  id: string,
  input: {
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
  },
  tx: TxLike = prisma
) {
  const data: Record<string, unknown> = {};
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.startDate !== undefined) data.startDate = dateKeyToDate(input.startDate);
  if (input.endDate !== undefined) data.endDate = dateKeyToDate(input.endDate);
  if (input.startTime !== undefined) data.startTime = input.startTime;
  if (input.endTime !== undefined) data.endTime = input.endTime;
  if (input.allDay !== undefined) data.allDay = input.allDay;
  if (input.location !== undefined) data.location = input.location;
  if (input.clientName !== undefined) data.clientName = input.clientName;
  if (input.trainerName !== undefined) data.trainerName = input.trainerName;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.color !== undefined) data.color = input.color;

  return tx.calendarEvent.update({
    where: { id },
    data: data as any,
  });
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
      employeeId,
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
    },
    orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
  });
}
