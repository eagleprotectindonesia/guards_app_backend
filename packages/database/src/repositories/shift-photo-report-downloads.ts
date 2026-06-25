import { db as prisma } from '../prisma/client';
import { Prisma, ShiftPhotoReportDownloadMode } from '@prisma/client';

export type ShiftPhotoReportDownloadRecord = {
  id: string;
  reportId: string;
  reportNumber: string | null;
  shiftId: string;
  adminId: string;
  mode: 'single' | 'bulk';
  userAgent: string | null;
  ipAddress: string | null;
  downloadedAt: Date;
  createdAt: Date;
};

export async function logShiftPhotoReportDownload(params: {
  reportId: string;
  adminId: string;
  mode: 'single' | 'bulk';
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const report = await prisma.shiftPhotoReport.findUnique({
    where: { id: params.reportId },
    select: { reportNumber: true, shiftId: true },
  });

  if (!report) {
    console.warn(`[ShiftPhotoReportDownload] Report not found: ${params.reportId}`);
    return;
  }

  await prisma.shiftPhotoReportDownload.create({
    data: {
      reportId: params.reportId,
      reportNumber: report.reportNumber,
      shiftId: report.shiftId,
      adminId: params.adminId,
      mode: params.mode as ShiftPhotoReportDownloadMode,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

export async function getShiftPhotoReportDownloadCountsByReportIds(reportIds: string[]) {
  if (reportIds.length === 0) return {} as Record<string, number>;

  const groups = await prisma.shiftPhotoReportDownload.groupBy({
    by: ['reportId'],
    _count: { id: true },
    where: { reportId: { in: reportIds } },
  });

  const map: Record<string, number> = {};
  for (const g of groups) {
    map[g.reportId] = g._count.id;
  }
  return map;
}

const DOWNLOAD_SORT_FIELDS = {
  downloadedAt: (o: 'asc' | 'desc') => ({ downloadedAt: o } as const),
  mode: (o: 'asc' | 'desc') => ({ mode: o } as const),
  reportNumber: (o: 'asc' | 'desc') => ({ reportNumber: o } as const),
  adminName: (o: 'asc' | 'desc') => ({ admin: { name: o } } as const),
  guardName: (o: 'asc' | 'desc') => ({ report: { employee: { fullName: o } } } as const),
  siteName: (o: 'asc' | 'desc') => ({ report: { shift: { site: { name: o } } } } as const),
} as const;

type DownloadSortBy = keyof typeof DOWNLOAD_SORT_FIELDS;

export async function listShiftPhotoReportDownloadsPaginated(params: {
  dateFrom?: Date;
  dateTo?: Date;
  adminId?: string;
  reportId?: string;
  shiftId?: string;
  mode?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: string;
}) {
  const { dateFrom, dateTo, adminId, reportId, shiftId, mode, page, pageSize } = params;

  const where: Prisma.ShiftPhotoReportDownloadWhereInput = {};

  if (dateFrom || dateTo) {
    where.downloadedAt = {};
    if (dateFrom) where.downloadedAt.gte = dateFrom;
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.downloadedAt.lte = endOfDay;
    }
  }
  if (adminId) where.adminId = adminId;
  if (reportId) where.reportId = reportId;
  if (shiftId) where.shiftId = shiftId;
  if (mode) where.mode = mode as ShiftPhotoReportDownloadMode;

  const skip = (page - 1) * pageSize;

  const sortBy: DownloadSortBy =
    params.sortBy && params.sortBy in DOWNLOAD_SORT_FIELDS ? (params.sortBy as DownloadSortBy) : 'downloadedAt';
  const sortOrder: 'asc' | 'desc' =
    params.sortOrder === 'asc' || params.sortOrder === 'desc' ? params.sortOrder : 'desc';

  const orderBy: Prisma.ShiftPhotoReportDownloadOrderByWithRelationInput = DOWNLOAD_SORT_FIELDS[sortBy](sortOrder);

  const [downloads, totalCount] = await prisma.$transaction(async tx => {
    const rows = await tx.shiftPhotoReportDownload.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        admin: { select: { name: true, email: true } },
        report: {
          select: {
            reportNumber: true,
            employee: { select: { fullName: true, employeeNumber: true } },
            shift: { select: { site: { select: { id: true, name: true, clientName: true } } } },
          },
        },
      },
    });
    const count = await tx.shiftPhotoReportDownload.count({ where });
    return [rows, count] as const;
  });

  return { downloads, totalCount };
}

export async function exportShiftPhotoReportDownloadsCsv(params: {
  dateFrom?: Date;
  dateTo?: Date;
  adminId?: string;
  reportId?: string;
  shiftId?: string;
  mode?: string;
}) {
  const where: Prisma.ShiftPhotoReportDownloadWhereInput = {};

  if (params.dateFrom || params.dateTo) {
    where.downloadedAt = {};
    if (params.dateFrom) where.downloadedAt.gte = params.dateFrom;
    if (params.dateTo) {
      const endOfDay = new Date(params.dateTo);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.downloadedAt.lte = endOfDay;
    }
  }
  if (params.adminId) where.adminId = params.adminId;
  if (params.reportId) where.reportId = params.reportId;
  if (params.shiftId) where.shiftId = params.shiftId;
  if (params.mode) where.mode = params.mode as ShiftPhotoReportDownloadMode;

  const downloads = await prisma.shiftPhotoReportDownload.findMany({
    where,
    orderBy: { downloadedAt: 'desc' },
    include: {
      admin: { select: { name: true, email: true } },
      report: {
        select: {
          reportNumber: true,
          employee: { select: { fullName: true, employeeNumber: true } },
          shift: { select: { site: { select: { name: true } } } },
        },
      },
    },
  });

  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

  const header = [
    'Downloaded At',
    'Mode',
    'Admin Name',
    'Admin Email',
    'Report #',
    'Guard Name',
    'Guard Number',
    'Site',
    'IP Address',
    'User Agent',
  ];

  const lines = downloads.map(d =>
    [
      escape(fmt(d.downloadedAt)),
      escape(d.mode),
      escape(d.admin.name),
      escape(d.admin.email),
      escape(d.reportNumber ?? d.report.reportNumber ?? ''),
      escape(d.report.employee?.fullName ?? ''),
      escape(d.report.employee?.employeeNumber ?? ''),
      escape(d.report.shift.site?.name ?? ''),
      escape(d.ipAddress ?? ''),
      escape(d.userAgent ?? ''),
    ].join(',')
  );

  return [header.join(','), ...lines].join('\n');
}
