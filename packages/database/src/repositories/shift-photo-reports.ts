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
  groupShiftId: string | null;
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
      groupShiftId: true,
      employee: { select: { fullName: true, employeeNumber: true } },
      site: {
        select: {
          name: true,
          clientName: true,
          latitude: true,
          longitude: true,
          geofenceRadius: true,
          geofenceStatus: true,
        },
      },
      shiftType: { select: { name: true } },
      attendance: { select: { picture: true, recordedAt: true, metadata: true } },
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
  latitude: number | null;
  longitude: number | null;
  content: string | null;
  attendanceMatchedName: string | null;
};

function extractAttendanceMatchedName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const meta = metadata as { matchedLocation?: { name?: unknown } | null };
  const name = meta.matchedLocation?.name;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

export async function getShiftReportPhotos(params: {
  shift: { employeeId: string | null; startsAt: Date; endsAt: Date };
  attendance?: { picture: string | null; recordedAt: Date; metadata?: unknown } | null;
  groupChatId?: string | null;
}): Promise<ShiftPhoto[]> {
  const { shift, attendance, groupChatId } = params;
  if (!shift.employeeId) return [];

  const [directMessages, groupMessages] = await Promise.all([
    prisma.chatMessage.findMany({
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
        latitude: true,
        longitude: true,
        content: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    groupChatId
      ? prisma.groupChatMessage.findMany({
          where: {
            groupId: groupChatId,
            employeeId: shift.employeeId,
            status: 'sent' as const,
            createdAt: { gte: shift.startsAt, lte: shift.endsAt },
            attachments: { isEmpty: false },
          },
          select: {
            id: true,
            attachments: true,
            createdAt: true,
            latitude: true,
            longitude: true,
            content: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const photos: ShiftPhoto[] = [];

  // Prepend attendance check-in photo (if present) as the first page
  if (attendance?.picture) {
    seen.add(attendance.picture);
    photos.push({
      messageId: 'attendance',
      s3Key: attendance.picture,
      createdAt: attendance.recordedAt,
      latitude: null,
      longitude: null,
      content: null,
      attendanceMatchedName: extractAttendanceMatchedName(attendance.metadata),
    });
  }

  for (const msg of directMessages) {
    const trimmedContent = typeof msg.content === 'string' && msg.content.trim().length > 0
      ? msg.content.trim()
      : null;
    for (const att of msg.attachments) {
      if (!att) continue;
      if (seen.has(att)) continue;
      seen.add(att);

      photos.push({
        messageId: msg.id,
        s3Key: att,
        createdAt: msg.createdAt,
        latitude: msg.latitude ?? null,
        longitude: msg.longitude ?? null,
        content: trimmedContent,
        attendanceMatchedName: null,
      });
    }
  }

  for (const msg of groupMessages) {
    const trimmedContent = typeof msg.content === 'string' && msg.content.trim().length > 0
      ? msg.content.trim()
      : null;
    for (const att of msg.attachments) {
      if (!att) continue;
      if (seen.has(att)) continue;
      seen.add(att);

      photos.push({
        messageId: msg.id,
        s3Key: att,
        createdAt: msg.createdAt,
        latitude: msg.latitude ?? null,
        longitude: msg.longitude ?? null,
        content: trimmedContent,
        attendanceMatchedName: null,
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
    const report = await tx.shiftPhotoReport.create({
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

    await tx.changelog.create({
      data: {
        action: 'CREATE',
        entityType: 'ShiftPhotoReport',
        entityId: report.id,
        actor: data.triggeredBy === 'manual' ? 'admin' : 'system',
        actorId: data.createdByAdminId ?? undefined,
        details: { shiftId: data.shiftId, reportNumber, employeeId: data.employeeId },
      },
    });

    return report;
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

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'ShiftPhotoReport',
        entityId: report.id,
        actor: 'system',
        details: { status: 'generated', photoCount: params.photoCount },
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

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'ShiftPhotoReport',
        entityId: report.id,
        actor: 'system',
        details: { status: 'failed', errorMessage: params.errorMessage },
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
  employeeNumber: (o: 'asc' | 'desc') => ({ employee: { employeeNumber: o } } as const),
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
  employeeNumber?: string;
  siteId?: string;
  status?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: string;
}) {
  const { dateFrom, dateTo, employeeId, employeeNumber, siteId, status, page, pageSize } = params;

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
  if (employeeNumber) where.employee = { employeeNumber };
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

export type ShiftLocationPoint = {
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type ShiftLocationSources = {
  attendancePoint: ShiftLocationPoint | null;
  checkinPoints: ShiftLocationPoint[];
  chatPoints: ShiftLocationPoint[];
};

export async function getShiftLocationPoints(params: {
  shiftId: string;
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
  groupChatId?: string | null;
}): Promise<ShiftLocationSources> {
  const { shiftId, employeeId, startsAt, endsAt, groupChatId } = params;

  const [attendance, chatMessages, groupChatMessages, checkins] = await Promise.all([
    prisma.attendance.findUnique({
      where: { shiftId },
      select: { recordedAt: true, metadata: true },
    }),
    prisma.chatMessage.findMany({
      where: {
        employeeId,
        status: 'sent',
        createdAt: { gte: startsAt, lte: endsAt },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { createdAt: true, latitude: true, longitude: true },
      orderBy: { createdAt: 'asc' },
    }),
    groupChatId
      ? prisma.groupChatMessage.findMany({
          where: {
            groupId: groupChatId,
            employeeId,
            status: 'sent',
            createdAt: { gte: startsAt, lte: endsAt },
            latitude: { not: null },
            longitude: { not: null },
          },
          select: { createdAt: true, latitude: true, longitude: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    prisma.checkin.findMany({
      where: {
        shiftId,
        at: { gte: startsAt, lte: endsAt },
      },
      select: { at: true, metadata: true },
    }),
  ]);

  const chatPoints: ShiftLocationPoint[] = [];
  for (const m of chatMessages) {
    if (m.latitude != null && m.longitude != null) {
      chatPoints.push({
        timestamp: m.createdAt,
        latitude: m.latitude,
        longitude: m.longitude,
        accuracyMeters: null,
      });
    }
  }

  for (const m of groupChatMessages) {
    if (m.latitude != null && m.longitude != null) {
      chatPoints.push({
        timestamp: m.createdAt,
        latitude: m.latitude,
        longitude: m.longitude,
        accuracyMeters: null,
      });
    }
  }

  const checkinPoints: ShiftLocationPoint[] = [];
  for (const c of checkins) {
    const meta = c.metadata as { latitude?: number; longitude?: number; accuracy?: number } | null;
    if (meta && typeof meta.latitude === 'number' && typeof meta.longitude === 'number') {
      const accuracy = typeof meta.accuracy === 'number' && Number.isFinite(meta.accuracy) ? meta.accuracy : null;
      checkinPoints.push({
        timestamp: c.at,
        latitude: meta.latitude,
        longitude: meta.longitude,
        accuracyMeters: accuracy,
      });
    }
  }

  let attendancePoint: ShiftLocationPoint | null = null;
  if (attendance) {
    const meta = attendance.metadata as { location?: { lat?: number; lng?: number }; accuracy?: number } | null;
    const loc = meta?.location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      const accuracy = meta && typeof meta.accuracy === 'number' && Number.isFinite(meta.accuracy) ? meta.accuracy : null;
      attendancePoint = {
        timestamp: attendance.recordedAt,
        latitude: loc.lat,
        longitude: loc.lng,
        accuracyMeters: accuracy,
      };
    }
  }

  return { attendancePoint, checkinPoints, chatPoints };
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
