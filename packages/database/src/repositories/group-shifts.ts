import { db as prisma } from '../prisma/client';

export async function upsertGroupShift(params: {
  siteId: string;
  endSiteId: string;
  shiftTypeId: string;
  date: Date;
  clientName?: string | null;
}) {
  const { siteId, endSiteId, shiftTypeId, date, clientName } = params;

  const existing = await prisma.groupShift.findUnique({
    where: { siteId_endSiteId_date: { siteId, endSiteId, date } },
  });

  if (existing) {
    if (clientName !== undefined && clientName !== existing.clientName) {
      return prisma.groupShift.update({
        where: { id: existing.id },
        data: { clientName },
      });
    }
    return existing;
  }

  return prisma.groupShift.create({
    data: {
      siteId,
      endSiteId,
      shiftTypeId,
      date,
      clientName,
      kind: 'escort',
    },
  });
}

export async function getGroupShiftById(id: string) {
  return prisma.groupShift.findUnique({
    where: { id },
    include: { shifts: true, groupChat: true },
  });
}

export async function getGroupShiftByKeys(params: { siteId: string; endSiteId: string; date: Date }) {
  const { siteId, endSiteId, date } = params;
  return prisma.groupShift.findUnique({
    where: { siteId_endSiteId_date: { siteId, endSiteId, date } },
    include: { groupChat: true },
  });
}
