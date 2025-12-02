import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShiftSchema } from '@/lib/validations';

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
    });

    if (!shiftType) {
      return NextResponse.json({ error: 'Shift Type not found' }, { status: 404 });
    }

    // 2. Calculate startsAt and endsAt
    // Format: "2023-12-01T08:00:00.000Z" (ISO) constructed from date and HH:mm
    const dateStr = body.date; // "YYYY-MM-DD"
    const startsAt = new Date(`${dateStr}T${shiftType.startTime}:00`);
    let endsAt = new Date(`${dateStr}T${shiftType.endTime}:00`);

    // Handle Overnight Shifts: If end time is before start time, it means it ends the next day
    if (endsAt <= startsAt) {
      endsAt.setDate(endsAt.getDate() + 1);
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
