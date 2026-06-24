import { db as prisma } from '../prisma/client';
import { Prisma, PrismaClient, ShiftStatus, ShiftPhotoReportStatus } from '@prisma/client';

const TZ = 'Asia/Makassar';

function formatWitaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function nextShiftPhotoReportNumber(tx: Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>, dateForCounter: Date): Promise<string> {
  const dateKey = formatWitaDateKey(dateForCounter);
  const seq = await tx.shiftPhotoReportDailySequence.upsert({
    where: { dateKey },
    create: { dateKey, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return `${dateKey}-${String(seq.lastValue).padStart(5, '0')}`;
}

export const SHIFT_PHOTO_REPORT_WAIT_MINUTES = 10;

export type ShiftPhotoReportCandidate = {
  shiftId: string;
  employeeId: string;
  clientName: string | null;
  employeeName: string;
  employeeNumber: string;
  siteName: string;
  startsAt: Date;
  endsAt: Date;
};

export async function getOnsiteShiftPhotoReportCandidates(now: Date, graceAfterEndMins = 10) {
  const waitCutoff = new Date(now.getTime() - graceAfterEndMins * 60_000);
  const pendingStaleCutoff = new Date(now.getTime() - 30 * 60_000);
  const failedRetryCutoff = new Date(now.getTime() - 30 * 60_000);

  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      status: ShiftStatus.completed,
      endsAt: { lte: waitCutoff },
      OR: [
        { autoPhotoReportStatus: null },
        { autoPhotoReportStatus: ShiftPhotoReportStatus.failed, lastAutoPhotoReportAt: { lt: failedRetryCutoff } },
        { autoPhotoReportStatus: ShiftPhotoReportStatus.pending, lastAutoPhotoReportAt: { lt: pendingStaleCutoff } },
      ],
    },
    select: {
      id: true,
      employeeId: true,
      siteId: true,
      startsAt: true,
      endsAt: true,
      employee: { select: { fullName: true, employeeNumber: true } },
      site: { select: { name: true, clientName: true } },
      attendance: { select: { picture: true, recordedAt: true } },
    },
    take: 10,
    orderBy: { lastAutoPhotoReportAt: { sort: 'asc', nulls: 'first' } },
  });
}

export async function claimOnsiteShiftPhotoReport(shiftId: string, now: Date) {
  const pendingStaleCutoff = new Date(now.getTime() - 30 * 60_000);

  const failedRetryCutoff = new Date(now.getTime() - 30 * 60_000);

  return prisma.$transaction(async tx => {
    // Delete any existing pending rows for this shift to maintain 1:1
    const deleted = await tx.shiftPhotoReport.deleteMany({
      where: { shiftId, status: 'pending' },
    });
    if (deleted.count > 0) {
      console.log(`[ShiftPhotoReport] Deleted ${deleted.count} orphaned pending row(s) for shift ${shiftId}`);
    }

    const result = await tx.shift.updateMany({
      where: {
        id: shiftId,
        deletedAt: null,
        OR: [
          { autoPhotoReportStatus: null },
          { autoPhotoReportStatus: ShiftPhotoReportStatus.failed, lastAutoPhotoReportAt: { lt: failedRetryCutoff } },
          { autoPhotoReportStatus: ShiftPhotoReportStatus.pending, lastAutoPhotoReportAt: { lt: pendingStaleCutoff } },
        ],
      },
      data: {
        autoPhotoReportStatus: ShiftPhotoReportStatus.pending,
        lastAutoPhotoReportAt: now,
      },
    });

    return result.count > 0;
  });
}

type ShiftPhoto = {
  messageId: string;
  s3Key: string;
  createdAt: Date;
};

export async function getShiftReportPhotos(params: {
  shift: { employeeId: string | null; startsAt: Date; endsAt: Date };
  attendance?: { picture: string | null; recordedAt: Date } | null;
}): Promise<ShiftPhoto[]> {
  const { shift, attendance } = params;
  if (!shift.employeeId) return [];

  const messages = await prisma.chatMessage.findMany({
    where: {
      employeeId: shift.employeeId,
      status: 'sent' as const,
      createdAt: { gte: shift.startsAt, lte: shift.endsAt },
      attachments: { isEmpty: false },
    },
    select: {
      id: true,
      attachments: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set<string>();
  const photos: ShiftPhoto[] = [];

  // Prepend attendance check-in photo (if present) as the first page
  if (attendance?.picture) {
    seen.add(attendance.picture);
    photos.push({
      messageId: 'attendance',
      s3Key: attendance.picture,
      createdAt: attendance.recordedAt,
    });
  }

  for (const msg of messages) {
    for (const att of msg.attachments) {
      if (!att) continue;
      if (seen.has(att)) continue;
      seen.add(att);

      photos.push({
        messageId: msg.id,
        s3Key: att,
        createdAt: msg.createdAt,
      });
    }
  }

  return photos;
}

export async function createShiftPhotoReport(data: {
  shiftId: string;
  employeeId: string;
  clientId: string | null;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  triggeredBy?: string;
  createdByAdminId?: string | null;
  photoCount?: number;
}) {
  return prisma.$transaction(async tx => {
    const reportNumber = await nextShiftPhotoReportNumber(tx, data.shiftStartsAt);
    return tx.shiftPhotoReport.create({
      data: {
        shiftId: data.shiftId,
        employeeId: data.employeeId,
        clientId: data.clientId,
        shiftStartsAt: data.shiftStartsAt,
        shiftEndsAt: data.shiftEndsAt,
        triggeredBy: data.triggeredBy ?? 'auto',
        createdByAdminId: data.createdByAdminId ?? null,
        photoCount: data.photoCount ?? 0,
        reportNumber,
        status: 'pending' as const,
      },
    });
  });
}

export async function markShiftPhotoReportGenerated(params: {
  id: string;
  pdfS3Key: string;
  pdfS3Bucket: string;
  pdfSizeBytes: number;
  photoCount: number;
}) {
  return prisma.$transaction(async tx => {
    const report = await tx.shiftPhotoReport.update({
      where: { id: params.id },
      data: {
        status: ShiftPhotoReportStatus.generated,
        pdfS3Key: params.pdfS3Key,
        pdfS3Bucket: params.pdfS3Bucket,
        pdfSizeBytes: params.pdfSizeBytes,
        photoCount: params.photoCount,
        generatedAt: new Date(),
      },
    });

    await tx.shift.update({
      where: { id: report.shiftId },
      data: {
        autoPhotoReportStatus: ShiftPhotoReportStatus.generated,
        lastAutoPhotoReportId: report.id,
        lastAutoPhotoReportAt: new Date(),
      },
    });

    return report;
  });
}

export async function markShiftPhotoReportFailed(params: { id: string; errorMessage: string }) {
  return prisma.$transaction(async tx => {
    const report = await tx.shiftPhotoReport.update({
      where: { id: params.id },
      data: {
        status: ShiftPhotoReportStatus.failed,
        errorMessage: params.errorMessage,
        attemptCount: { increment: 1 },
      },
    });

    await tx.shift.update({
      where: { id: report.shiftId },
      data: {
        autoPhotoReportStatus: ShiftPhotoReportStatus.failed,
        lastAutoPhotoReportAt: new Date(),
      },
    });

    return report;
  });
}

export async function getShiftPhotoReportById(id: string) {
  return prisma.shiftPhotoReport.findUnique({
    where: { id },
    include: {
      shift: {
        include: {
          shiftType: { select: { name: true } },
        },
      },
      employee: { select: { fullName: true, employeeNumber: true } },
    },
  });
}

const SHIFT_PHOTO_REPORT_SORT_FIELDS = {
  reportNumber: (o: 'asc' | 'desc') => ({ reportNumber: o } as const),
  site: (o: 'asc' | 'desc') => ({ shift: { site: { name: o } } } as const),
  employee: (o: 'asc' | 'desc') => ({ employee: { fullName: o } } as const),
  status: (o: 'asc' | 'desc') => ({ status: o } as const),
  photoCount: (o: 'asc' | 'desc') => ({ photoCount: o } as const),
  generatedAt: (o: 'asc' | 'desc') => ({ generatedAt: o } as const),
} as const;

type ShiftPhotoReportSortBy = keyof typeof SHIFT_PHOTO_REPORT_SORT_FIELDS;

export async function listShiftPhotoReportsPaginated(params: {
  dateFrom?: Date;
  dateTo?: Date;
  employeeId?: string;
  siteId?: string;
  status?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: string;
}) {
  const { dateFrom, dateTo, employeeId, siteId, status, page, pageSize } = params;

  const where: Prisma.ShiftPhotoReportWhereInput = {};

  if (dateFrom || dateTo) {
    where.shift = where.shift || {};
    where.shift.endsAt = {};
    if (dateFrom) where.shift.endsAt.gte = dateFrom;
    if (dateTo) {
      // Extend to end of day so the full end-date is included
      const endOfDay = new Date(dateTo);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.shift.endsAt.lte = endOfDay;
    }
  }
  if (employeeId) where.employeeId = employeeId;
  if (siteId) where.clientId = siteId;
  if (status) where.status = status as ShiftPhotoReportStatus;

  const skip = (page - 1) * pageSize;

  const sortBy: ShiftPhotoReportSortBy | 'createdAt' =
    params.sortBy && params.sortBy in SHIFT_PHOTO_REPORT_SORT_FIELDS
      ? (params.sortBy as ShiftPhotoReportSortBy)
      : 'createdAt';
  const sortOrder: 'asc' | 'desc' =
    params.sortOrder === 'asc' || params.sortOrder === 'desc' ? params.sortOrder : 'desc';

  const orderBy: Prisma.ShiftPhotoReportOrderByWithRelationInput =
    sortBy === 'createdAt'
      ? { createdAt: sortOrder }
      : SHIFT_PHOTO_REPORT_SORT_FIELDS[sortBy](sortOrder);

  const [reports, totalCount] = await prisma.$transaction(async tx => {
    const reports = await tx.shiftPhotoReport.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        employee: { select: { fullName: true, employeeNumber: true } },
        shift: {
          select: {
            siteId: true,
            site: { select: { id: true, name: true, clientName: true } },
          },
        },
      },
    });
    const totalCount = await tx.shiftPhotoReport.count({ where });
    return [reports, totalCount] as const;
  });

  return { reports, totalCount };
}

export async function resetShiftPhotoReportClaim(shiftId: string) {
  const result = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      deletedAt: null,
      autoPhotoReportStatus: ShiftPhotoReportStatus.pending,
    },
    data: {
      autoPhotoReportStatus: null,
      lastAutoPhotoReportAt: null,
      lastAutoPhotoReportId: null,
    },
  });

  return result.count > 0;
}

export async function getShiftPhotoReportByShiftId(shiftId: string) {
  return prisma.shiftPhotoReport.findFirst({
    where: { shiftId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createRegeneratedShiftPhotoReport(params: { originalReportId: string; adminId: string }) {
  return prisma.$transaction(async tx => {
    const original = await tx.shiftPhotoReport.findUnique({
      where: { id: params.originalReportId },
      include: { shift: true },
    });

    if (!original) throw new Error('Original report not found');

    const reportNumber = await nextShiftPhotoReportNumber(tx, original.shiftStartsAt);

    console.log(`[ShiftPhotoReport] Regenerating report ${original.id} for shift ${original.shiftId} (admin ${params.adminId})`);

    const report = await tx.shiftPhotoReport.update({
      where: { id: original.id },
      data: {
        reportNumber,
        status: 'pending' as const,
        triggeredBy: 'manual',
        createdByAdminId: params.adminId,
        pdfS3Key: null,
        pdfS3Bucket: null,
        pdfSizeBytes: null,
        generatedAt: null,
        errorMessage: null,
        regeneratedFromId: null,
        photoCount: 0,
      },
    });

    await tx.shift.update({
      where: { id: original.shiftId },
      data: {
        autoPhotoReportStatus: ShiftPhotoReportStatus.pending,
        lastAutoPhotoReportAt: new Date(),
      },
    });

    return report;
  });
}

export async function deleteOldShiftPhotoReports(olderThan: Date) {
  const expired = await prisma.shiftPhotoReport.findMany({
    where: { createdAt: { lt: olderThan } },
    select: { id: true, shiftId: true, pdfS3Key: true },
  });

  if (expired.length === 0) {
    return { deleted: 0, s3Keys: [] as string[] };
  }

  const reportIds = expired.map(r => r.id);
  const shiftIds = expired.map(r => r.shiftId);
  const s3Keys = expired.map(r => r.pdfS3Key).filter((k): k is string => k !== null);

  await prisma.$transaction(async tx => {
    await tx.shift.updateMany({
      where: {
        id: { in: shiftIds },
        lastAutoPhotoReportId: { in: reportIds },
      },
      data: {
        lastAutoPhotoReportId: null,
        lastAutoPhotoReportAt: null,
      },
    });

    await tx.shiftPhotoReport.updateMany({
      where: { regeneratedFromId: { in: reportIds } },
      data: { regeneratedFromId: null },
    });

    await tx.shiftPhotoReport.deleteMany({
      where: { id: { in: reportIds } },
    });
  });

  return { deleted: expired.length, s3Keys };
}
