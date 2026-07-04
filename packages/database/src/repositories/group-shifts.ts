import { Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';

export async function upsertGroupShift(params: {
  siteId: string;
  endSiteId?: string | null;
  shiftTypeId: string;
  date: Date;
  clientName?: string | null;
  flexibleEndTime?: boolean;
}) {
  const { siteId, endSiteId, shiftTypeId, date, clientName, flexibleEndTime } = params;

  let existing: Awaited<ReturnType<typeof prisma.groupShift.findFirst>>;

  if (endSiteId) {
    existing = await prisma.groupShift.findUnique({
      where: { siteId_endSiteId_date: { siteId, endSiteId, date } },
    });
  } else {
    existing = await prisma.groupShift.findFirst({
      where: { siteId, endSiteId: null, date },
    });
  }

  if (existing) {
    const updateData: Record<string, unknown> = {};
    if (clientName !== undefined && clientName !== existing.clientName) {
      updateData.clientName = clientName;
    }
    if (flexibleEndTime !== undefined && flexibleEndTime !== existing.flexibleEndTime) {
      updateData.flexibleEndTime = flexibleEndTime;
    }
    if (Object.keys(updateData).length > 0) {
      return prisma.groupShift.update({
        where: { id: existing.id },
        data: updateData,
      });
    }
    return existing;
  }

  return prisma.groupShift.create({
    data: {
      siteId,
      endSiteId: endSiteId ?? null,
      shiftTypeId,
      date,
      clientName: clientName ?? null,
      kind: 'escort',
      flexibleEndTime: flexibleEndTime ?? false,
    },
  });
}

export async function getGroupShiftById(id: string) {
  return prisma.groupShift.findUnique({
    where: { id },
    include: { shifts: true, groupChat: true },
  });
}

export async function getGroupShiftByKeys(params: { siteId: string; endSiteId?: string | null; date: Date }) {
  const { siteId, endSiteId, date } = params;

  if (endSiteId) {
    return prisma.groupShift.findUnique({
      where: { siteId_endSiteId_date: { siteId, endSiteId, date } },
      include: { groupChat: true },
    });
  }

  return prisma.groupShift.findFirst({
    where: { siteId, endSiteId: null, date },
    include: { groupChat: true },
  });
}

export async function getPaginatedGroupShifts(params: {
  startDate?: Date;
  endDate?: Date;
  siteId?: string;
  endSiteId?: string;
  page: number;
  perPage: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}) {
  const { startDate, endDate, siteId, endSiteId, page, perPage, sortBy, sortOrder } = params;

  const where: Prisma.GroupShiftWhereInput = {};
  const dateFilter: Prisma.DateTimeFilter = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;
  if (startDate || endDate) where.date = dateFilter;
  if (siteId) where.siteId = siteId;
  if (endSiteId) where.endSiteId = endSiteId;

  const orderBy: Prisma.GroupShiftOrderByWithRelationInput =
    sortBy === 'site'
      ? { site: { name: sortOrder } }
      : sortBy === 'endSite'
        ? { endSite: { name: sortOrder } }
        : sortBy === 'shiftType'
          ? { shiftType: { name: sortOrder } }
          : { date: sortOrder };

  const [groupShifts, totalCount] = await Promise.all([
    prisma.groupShift.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        site: { select: { id: true, name: true } },
        endSite: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, startTime: true, endTime: true } },
        groupChat: { select: { id: true } },
        shifts: { select: { id: true, status: true, employeeId: true } },
      },
    }),
    prisma.groupShift.count({ where }),
  ]);

  return { groupShifts, totalCount };
}

export async function getGroupShiftDetail(id: string) {
  return prisma.groupShift.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, name: true, kind: true, address: true, latitude: true, longitude: true } },
      endSite: { select: { id: true, name: true, address: true, kind: true, latitude: true, longitude: true } },
      shiftType: { select: { id: true, name: true, startTime: true, endTime: true } },
      groupChat: { select: { id: true, title: true } },
      shifts: {
        where: { deletedAt: null },
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          attendance: { select: { id: true, status: true, recordedAt: true } },
        },
        orderBy: [{ employee: { fullName: 'asc' } }],
      },
    },
  });
}

export async function updateGroupShift(id: string, data: { clientName?: string | null; note?: string | null }) {
  const updateData: Record<string, string | null> = {};
  if (data.clientName !== undefined) updateData.clientName = data.clientName;
  if (data.note !== undefined) updateData.note = data.note;

  return prisma.groupShift.update({
    where: { id },
    data: updateData,
  });
}
