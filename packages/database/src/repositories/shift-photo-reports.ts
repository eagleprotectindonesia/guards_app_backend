import { db as prisma } from '../prisma/client';
import { Prisma, ShiftStatus, ShiftPhotoReportStatus } from '@prisma/client';

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

  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      status: ShiftStatus.completed,
      endsAt: { lte: waitCutoff },
      OR: [
        { autoPhotoReportStatus: null },
        { autoPhotoReportStatus: ShiftPhotoReportStatus.failed, lastAutoPhotoReportAt: { lt: now } },
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
  });
}

export async function claimOnsiteShiftPhotoReport(shiftId: string, now: Date) {
  const pendingStaleCutoff = new Date(now.getTime() - 30 * 60_000);

  const result = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      deletedAt: null,
      OR: [
        { autoPhotoReportStatus: null },
        { autoPhotoReportStatus: ShiftPhotoReportStatus.failed, lastAutoPhotoReportAt: { lt: now } },
        { autoPhotoReportStatus: ShiftPhotoReportStatus.pending, lastAutoPhotoReportAt: { lt: pendingStaleCutoff } },
      ],
    },
    data: {
      autoPhotoReportStatus: ShiftPhotoReportStatus.pending,
      lastAutoPhotoReportAt: now,
    },
  });

  return result.count > 0;
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
  return prisma.shiftPhotoReport.create({
    data: {
      shiftId: data.shiftId,
      employeeId: data.employeeId,
      clientId: data.clientId,
      shiftStartsAt: data.shiftStartsAt,
      shiftEndsAt: data.shiftEndsAt,
      triggeredBy: data.triggeredBy ?? 'auto',
      createdByAdminId: data.createdByAdminId ?? null,
      photoCount: data.photoCount ?? 0,
      status: 'pending' as const,
    },
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

export async function listShiftPhotoReportsPaginated(params: {
  dateFrom?: Date;
  dateTo?: Date;
  employeeId?: string;
  clientId?: string;
  status?: ShiftPhotoReportStatus;
  page: number;
  pageSize: number;
}) {
  const { dateFrom, dateTo, employeeId, clientId, status, page, pageSize } = params;

  const where: Prisma.ShiftPhotoReportWhereInput = {};

  if (dateFrom || dateTo) {
    where.generatedAt = {};
    if (dateFrom) where.generatedAt.gte = dateFrom;
    if (dateTo) {
      // Extend to end of day so the full end-date is included
      const endOfDay = new Date(dateTo);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.generatedAt.lte = endOfDay;
    }
  }
  if (employeeId) where.employeeId = employeeId;
  if (clientId) where.clientId = clientId;
  if (status) where.status = status;

  const skip = (page - 1) * pageSize;

  const [reports, totalCount] = await prisma.$transaction(async tx => {
    const reports = await tx.shiftPhotoReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        employee: { select: { fullName: true, employeeNumber: true } },
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
  const original = await prisma.shiftPhotoReport.findUnique({
    where: { id: params.originalReportId },
    include: { shift: true },
  });

  if (!original) throw new Error('Original report not found');

  const report = await prisma.shiftPhotoReport.create({
    data: {
      shiftId: original.shiftId,
      employeeId: original.employeeId,
      clientId: original.clientId,
      shiftStartsAt: original.shiftStartsAt,
      shiftEndsAt: original.shiftEndsAt,
      triggeredBy: 'manual',
      createdByAdminId: params.adminId,
      status: 'pending' as const,
      regeneratedFromId: original.id,
    },
  });

  await prisma.shiftPhotoReport.update({
    where: { id: original.id },
    data: { status: ShiftPhotoReportStatus.regenerated },
  });

  await prisma.shift.update({
    where: { id: original.shiftId },
    data: {
      autoPhotoReportStatus: ShiftPhotoReportStatus.pending,
      lastAutoPhotoReportId: report.id,
      lastAutoPhotoReportAt: new Date(),
    },
  });

  return report;
}
