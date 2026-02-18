import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, ShiftStatus } from '@prisma/client';
import { parseISO, startOfDay, endOfDay, isValid } from 'date-fns';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const skip = (page - 1) * limit;

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const siteId = searchParams.get('siteId');
  const employeeId = searchParams.get('employeeId');
  const status = searchParams.get('status');

  const where: Prisma.ShiftWhereInput = { deletedAt: null };

  if (startDate || endDate) {
    where.date = {};
    if (startDate) {
      const start = startOfDay(parseISO(startDate));
      if (isValid(start)) {
        where.date.gte = start;
      }
    }
    if (endDate) {
      const end = endOfDay(parseISO(endDate));
      if (isValid(end)) {
        where.date.lte = end;
      }
    }
  }

  if (siteId) where.siteId = siteId;
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status as ShiftStatus;

  try {
    const [shifts, totalCount] = await Promise.all([
      prisma.shift.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip,
        take: limit,
        include: {
          site: {
            select: { id: true, name: true },
          },
          employee: {
            select: { id: true, fullName: true },
          },
          shiftType: {
            select: { id: true, name: true, startTime: true, endTime: true },
          },
        },
      }),
      prisma.shift.count({ where }),
    ]);

    const safeShifts = shifts.map(shift => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lastUpdatedById, createdById, deletedAt, ...safeShift } = shift;
      return safeShift;
    });

    return NextResponse.json({
      data: safeShifts,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching shifts for external API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
