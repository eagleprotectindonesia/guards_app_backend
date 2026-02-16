import { db as prisma } from "../client";
import { Prisma } from '@prisma/client';

/**
 * Get attendances with their associated check-ins, grouped by shift
 * @param params - Filter parameters
 * @returns Array of attendances with check-ins and total count
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

  // Fetch attendances with their shifts and check-ins
  const [attendances, totalCount] = await Promise.all([
    prisma.attendance.findMany({
      where: attendanceWhere,
      skip,
      take,
      include: {
        shift: {
          include: {
            site: {
              select: {
                name: true,
                clientName: true,
                address: true,
                latitude: true,
                longitude: true,
              },
            },
            shiftType: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        recordedAt: 'desc',
      },
    }),
    prisma.attendance.count({ where: attendanceWhere }),
  ]);

  // For each attendance, fetch the associated check-ins
  const data = await Promise.all(
    attendances.map(async (attendance) => {
      const checkins = await prisma.checkin.findMany({
        where: {
          shiftId: attendance.shiftId,
          ...(attendance.employeeId && { employeeId: attendance.employeeId }),
        },
        select: {
          id: true,
          employeeId: true,
          at: true,
          source: true,
          status: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: {
          at: 'asc',
        },
      });

      // Format the response structure
      return {
        attendance: {
          id: attendance.id,
          employeeId: attendance.employeeId,
          recordedAt: attendance.recordedAt,
          status: attendance.status,
          metadata: attendance.metadata,
          shift: {
            date: attendance.shift.date,
            startsAt: attendance.shift.startsAt,
            endsAt: attendance.shift.endsAt,
            status: attendance.shift.status,
            missedCount: attendance.shift.missedCount,
            site: attendance.shift.site,
            shiftType: attendance.shift.shiftType,
          },
        },
        checkins,
      };
    })
  );

  return { data, totalCount };
}
