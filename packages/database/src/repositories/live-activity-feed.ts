import { db as prisma } from '../prisma/client';

export type LiveActivityFeedItem = {
  id: string;
  kind: 'attendance' | 'checkin';
  occurredAt: string;
  guardName: string;
  siteName: string;
  status: string;
  shiftId: string;
  employeeId: string | null;
  shiftKind?: 'onsite' | 'escort' | 'office_control' | 'event_temporary';
  escortEndSiteName?: string | null;
};

export async function getLiveActivityFeedForDashboard(params?: { limit?: number }): Promise<LiveActivityFeedItem[]> {
  const limit = Math.max(1, params?.limit ?? 4);
  const queryLimit = Math.max(8, limit * 4);

  const [attendances, checkins] = await Promise.all([
    prisma.attendance.findMany({
      take: queryLimit,
      orderBy: { recordedAt: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        shift: {
          select: {
            id: true,
            kind: true,
            site: {
              select: {
                name: true,
              },
            },
            escortEndSite: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.checkin.findMany({
      take: queryLimit,
      orderBy: { at: 'desc' },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        shift: {
          select: {
            id: true,
            kind: true,
            site: {
              select: {
                name: true,
              },
            },
            escortEndSite: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const attendanceRows: LiveActivityFeedItem[] = attendances.map(attendance => ({
    id: `attendance:${attendance.id}`,
    kind: 'attendance',
    occurredAt: attendance.recordedAt.toISOString(),
    guardName: attendance.employee?.fullName ?? 'Unknown Guard',
    siteName: attendance.shift.site?.name ?? 'Unknown Site',
    status: attendance.status,
    shiftId: attendance.shiftId,
    employeeId: attendance.employeeId,
    shiftKind: attendance.shift.kind,
    escortEndSiteName: attendance.shift.escortEndSite?.name ?? null,
  }));

  const checkinRows: LiveActivityFeedItem[] = checkins.map(checkin => ({
    id: `checkin:${checkin.id}`,
    kind: 'checkin',
    occurredAt: checkin.at.toISOString(),
    guardName: checkin.employee?.fullName ?? 'Unknown Guard',
    siteName: checkin.shift.site?.name ?? 'Unknown Site',
    status: checkin.status,
    shiftId: checkin.shiftId,
    employeeId: checkin.employeeId,
    shiftKind: checkin.shift.kind,
    escortEndSiteName: checkin.shift.escortEndSite?.name ?? null,
  }));

  return [...attendanceRows, ...checkinRows]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}
