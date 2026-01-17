import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedCheckins } from '@repo/database';
import { Prisma, CheckInStatus } from '@prisma/client';

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

  const where: Prisma.CheckinWhereInput = {};

  if (employeeId) where.employeeId = employeeId;
  if (shiftId) where.shiftId = shiftId;
  if (status) where.status = status as CheckInStatus;

  if (startDate || endDate) {
    where.at = {};
    if (startDate) where.at.gte = new Date(startDate);
    if (endDate) where.at.lte = new Date(endDate);
  }

  try {
    const { checkins, totalCount } = await getPaginatedCheckins({
      where,
      orderBy: { at: 'desc' },
      skip,
      take: limit,
    });

    // Strip sensitive data
    const safeCheckins = checkins.map(ci => {
      const { employee, shift, ...rest } = ci;

      let safeEmployee = null;
      if (employee) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hashedPassword, tokenVersion, lastUpdatedById, createdById, deletedAt, ...empRest } = employee;
        safeEmployee = empRest;
      }

      let safeShift = null;
      if (shift) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { lastUpdatedById, createdById, deletedAt, ...shiftRest } = shift;

        let safeSite = null;
        if (shift.site) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { lastUpdatedById, createdById, deletedAt, ...siteRest } = shift.site;
          safeSite = siteRest;
        }

        safeShift = {
          ...shiftRest,
          site: safeSite,
        };
      }

      return {
        ...rest,
        employee: safeEmployee,
        shift: safeShift,
      };
    });

    return NextResponse.json({
      data: safeCheckins,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching check-ins for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
