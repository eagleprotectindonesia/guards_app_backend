import { db as prisma, Prisma } from '../prisma/client';

type TxLike = Prisma.TransactionClient | typeof prisma;

export interface TaggedUserResult {
  id: string;
  type: 'employee' | 'admin';
  name: string;
  email?: string;
}

export async function syncCalendarEventTags(
  eventId: string,
  taggedEmployeeIds: string[],
  taggedAdminIds: string[],
  tx: TxLike = prisma
) {
  await tx.calendarEventTag.deleteMany({ where: { eventId } });

  const tags: Array<{
    eventId: string;
    participantType: 'employee' | 'admin';
    employeeId?: string;
    adminId?: string;
  }> = [];

  for (const empId of taggedEmployeeIds) {
    tags.push({ eventId, participantType: 'employee', employeeId: empId });
  }
  for (const adId of taggedAdminIds) {
    tags.push({ eventId, participantType: 'admin', adminId: adId });
  }

  if (tags.length > 0) {
    await tx.calendarEventTag.createMany({ data: tags });
  }
}

export async function getCalendarEventTags(
  eventId: string,
  tx: TxLike = prisma
): Promise<TaggedUserResult[]> {
  const rows = await tx.calendarEventTag.findMany({
    where: { eventId },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((r) => {
    if (r.participantType === 'employee' && r.employee) {
      return {
        id: r.employee.id,
        type: 'employee' as const,
        name: r.employee.fullName,
      };
    }
    if (r.participantType === 'admin' && r.admin) {
      return {
        id: r.admin.id,
        type: 'admin' as const,
        name: r.admin.name,
        email: r.admin.email,
      };
    }
    return null as unknown as TaggedUserResult;
  }).filter(Boolean);
}

export async function findTaggedEventIds(
  employeeId: string,
  fromDate: Date,
  toDate: Date,
  tx: TxLike = prisma
): Promise<string[]> {
  const tags = await tx.calendarEventTag.findMany({
    where: {
      participantType: 'employee',
      employeeId,
      event: {
        deletedAt: null,
        endDate: { gte: fromDate },
        startDate: { lte: toDate },
      },
    },
    select: { eventId: true },
  });
  return tags.map((t) => t.eventId);
}

export async function getTagsForEvents(
  eventIds: string[],
  tx: TxLike = prisma
): Promise<Record<string, TaggedUserResult[]>> {
  if (eventIds.length === 0) return {};
  const rows = await tx.calendarEventTag.findMany({
    where: { eventId: { in: eventIds } },
    include: {
      employee: { select: { id: true, fullName: true, employeeNumber: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  const grouped: Record<string, TaggedUserResult[]> = {};
  for (const r of rows) {
    let user: TaggedUserResult | null = null;
    if (r.participantType === 'employee' && r.employee) {
      user = { id: r.employee.id, type: 'employee', name: r.employee.fullName };
    } else if (r.participantType === 'admin' && r.admin) {
      user = { id: r.admin.id, type: 'admin', name: r.admin.name, email: r.admin.email };
    }
    if (user) {
      if (!grouped[r.eventId]) grouped[r.eventId] = [];
      grouped[r.eventId].push(user);
    }
  }
  return grouped;
}
