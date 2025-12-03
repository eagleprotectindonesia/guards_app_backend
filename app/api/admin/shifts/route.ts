import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShiftSchema } from '@/lib/validations';
import { fromZonedTime } from 'date-fns-tz';

export async function GET(req: Request) {
  // TODO: Auth check (Admin only)
  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: any = {};
    if (siteId) {
      where.siteId = siteId;
    }
    if (from && to) {
      where.date = {
        gte: new Date(from),
        lte: new Date(to),
      };
    }

    const shifts = await prisma.shift.findMany({
      where,
      include: { shiftType: true, guard: true },
      orderBy: { startsAt: 'asc' },
    });
    return NextResponse.json(shifts);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // TODO: Auth check (Admin only)
  try {
    const json = await req.json();
    const body = createShiftSchema.parse(json);

    // 1. Fetch Shift Type to calculate actual times
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: body.shiftTypeId },
      include: { site: true },
    });

    if (!shiftType) {
      return NextResponse.json({ error: 'Shift Type not found' }, { status: 404 });
    }

    const timeZone = shiftType.site.timeZone;
    const dateStr = body.date; // "YYYY-MM-DD"

    // 2. Calculate startsAt and endsAt using Site Timezone
    // Construct ISO-like strings without Z to imply local time
    const startDateTimeStr = `${dateStr} ${shiftType.startTime}`; // "2023-12-01 08:00"
    const endDateTimeStr = `${dateStr} ${shiftType.endTime}`;     // "2023-12-01 17:00"

    // Convert site-local time to UTC
    const startsAt = fromZonedTime(startDateTimeStr, timeZone);
    let endsAt = fromZonedTime(endDateTimeStr, timeZone);

    // Handle Overnight Shifts: If end time is before start time, it means it ends the next day
    if (endsAt <= startsAt) {
            // Helper to add 1 day to YYYY-MM-DD
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      const nextDayStr = d.toISOString().split('T')[0];
      
      const nextDayEndStr = `${nextDayStr} ${shiftType.endTime}`;
      endsAt = fromZonedTime(nextDayEndStr, timeZone);
    }

    // 3. Check Guard Overlap (if guard assigned)
    if (body.guardId) {
      const guardOverlap = await prisma.shift.findFirst({
        where: {
          guardId: body.guardId,
          status: { not: 'missed' }, // Assuming 'missed' doesn't block future assignments, or maybe it should?
          // Check time overlap: (StartA < EndB) and (EndA > StartB)
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });

      if (guardOverlap) {
        return NextResponse.json({ error: 'Guard has an overlapping shift' }, { status: 409 });
      }
    }

    const shift = await prisma.shift.create({
      data: {
        siteId: body.siteId,
        shiftTypeId: body.shiftTypeId,
        guardId: body.guardId,
        date: new Date(body.date),
        startsAt,
        endsAt,
        requiredCheckinIntervalMins: body.requiredCheckinIntervalMins,
        graceMinutes: body.graceMinutes,
        status: 'scheduled', // Default status
      },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error: any) {
    console.error('Error creating shift:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
