import { NextResponse } from 'next/server';
import { prisma, getActiveShiftsForDashboard } from '@repo/database';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${dateKey}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [todayMissed, activeShifts] = await Promise.all([
    prisma.shift.findMany({
      where: {
        siteId: id,
        deletedAt: null,
        employeeId: { not: null },
        date: { gte: dayStart, lt: dayEnd },
        status: 'missed',
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        employee: {
          select: { id: true, nickname: true, fullName: true, employeeNumber: true },
        },
        attendance: {
          select: { id: true, status: true, recordedAt: true },
        },
      },
    }),
    getActiveShiftsForDashboard(now),
  ]);

  const activeIds = new Set(activeShifts.map(s => s.id));
  const shifts = todayMissed
    .filter(s => !activeIds.has(s.id))
    .map(s => ({
      shiftId: s.id,
      shiftStatus: s.status,
      employeeId: s.employee?.id ?? null,
      employeeName: s.employee?.nickname ?? s.employee?.fullName?.split(' ')[0] ?? 'Unknown',
      employeeNumber: s.employee?.employeeNumber ?? null,
      shiftStartsAt: s.startsAt.toISOString(),
      shiftEndsAt: s.endsAt.toISOString(),
      attendanceStatus: s.attendance?.status ?? null,
      lastCheckinAt: null,
      isPresent: false,
    }));

  return NextResponse.json({ shifts });
}
