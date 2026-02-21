import { db as prisma } from '../client';
import { Prisma } from '@prisma/client';

/**
 * Get attendances with their associated check-ins, grouped by employeeId
 * @param params - Filter parameters
 * @returns Record of employeeId => array of attendance+checkin records
 */
export async function getAttendancesWithCheckins(params: {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
  skip?: number;
  take?: number;
}) {
  const { employeeId, startDate, endDate, skip, take } = params;

  // Build the where clause for shifts
  const shiftWhere: Prisma.ShiftWhereInput = {
    deletedAt: null,
  };
  if (employeeId) shiftWhere.employeeId = employeeId;

  // Filter by shift start date
  if (startDate || endDate) {
    shiftWhere.startsAt = {};
    if (startDate) shiftWhere.startsAt.gte = startDate;
    if (endDate) shiftWhere.startsAt.lte = endDate;
  }

  const attendanceWhere: Prisma.AttendanceWhereInput = {
    shift: shiftWhere,
  };
  if (employeeId) attendanceWhere.employeeId = employeeId;

  // Fetch attendances
  const attendances = await prisma.attendance.findMany({
    where: attendanceWhere,
    skip,
    take,
    orderBy: {
      recordedAt: 'desc',
    },
  });

  // For each attendance, fetch the associated check-ins
  const items = await Promise.all(
    attendances.map(async attendance => {
      const checkinsResult = await prisma.checkin.findMany({
        where: {
          shiftId: attendance.shiftId,
          ...(attendance.employeeId && { employeeId: attendance.employeeId }),
        },
        select: {
          at: true,
          status: true,
          metadata: true,
        },
        orderBy: {
          at: 'asc',
        },
      });

      const checkins = checkinsResult.map(c => {
        const metadata = c.metadata as any;
        return {
          at: c.at,
          status: c.status,
          ...(c.status === 'late' && metadata?.latenessMins !== undefined
            ? { latenessMins: metadata.latenessMins }
            : {}),
        };
      });

      // Format the response structure
      const attendanceMetadata = attendance.metadata as any;
      return {
        employeeId: attendance.employeeId,
        attendance: {
          recordedAt: attendance.recordedAt,
          status: attendance.status,
          ...(attendance.status === 'late' && attendanceMetadata?.latenessMins !== undefined
            ? { latenessMins: attendanceMetadata.latenessMins }
            : {}),
        },
        checkins,
      };
    })
  );

  // Group by employeeId
  const grouped: Record<
    string,
    { attendance: (typeof items)[number]['attendance']; checkins: (typeof items)[number]['checkins'] }[]
  > = {};
  for (const item of items) {
    const key = item.employeeId ?? 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ attendance: item.attendance, checkins: item.checkins });
  }

  return { data: grouped };
}
