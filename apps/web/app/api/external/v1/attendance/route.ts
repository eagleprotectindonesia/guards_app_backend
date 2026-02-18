import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedAttendance } from '@repo/database';
import { Prisma, AttendanceStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Pagination params
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  // Filter params
  const employeeId = searchParams.get('employeeId');
  const shiftId = searchParams.get('shiftId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const where: Prisma.AttendanceWhereInput = {};

  if (employeeId) where.employeeId = employeeId;
  if (shiftId) where.shiftId = shiftId;
  if (status) where.status = status as AttendanceStatus;

  if (startDate || endDate) {
    where.recordedAt = {};
    if (startDate) where.recordedAt.gte = new Date(startDate);
    if (endDate) where.recordedAt.lte = new Date(endDate);
  }

  try {
    const { attendances, totalCount } = await getPaginatedAttendance({
      where,
      orderBy: { recordedAt: 'desc' },
      skip,
      take: limit,
    });

    // Strip sensitive data from employee and nested structures if any
    const safeAttendances = attendances.map(att => {
      const { employee, shift, ...rest } = att;
      
      let safeEmployee = null;
      if (employee) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hashedPassword, tokenVersion, deletedAt, ...empRest } = employee;
        safeEmployee = empRest;
      }

      let safeShift = null;
      if (shift) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { deletedAt, ...shiftRest } = shift;
        
        let safeSite = null;
        if (shift.site) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { deletedAt, ...siteRest } = shift.site;
          safeSite = siteRest;
        }

        let safeShiftType = null;
        if (shift.shiftType) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { deletedAt, ...stRest } = shift.shiftType;
          safeShiftType = stRest;
        }

        safeShift = {
          ...shiftRest,
          site: safeSite,
          shiftType: safeShiftType
        };
      }

      return {
        ...rest,
        employee: safeEmployee,
        shift: safeShift,
      };
    });

    return NextResponse.json({
      data: safeAttendances,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching attendance for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
