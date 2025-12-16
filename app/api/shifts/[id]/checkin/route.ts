import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkInSchema } from '@/lib/validations';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { ZodError } from 'zod';
import { calculateCheckInWindow } from '@/lib/scheduling';
import { calculateDistance } from '@/lib/utils';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const guard = await getAuthenticatedGuard();
  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const guardId = guard.id;

  try {
    const json = await req.json();
    const body = checkInSchema.parse(json);
    const now = new Date();

    // 1. Fetch Shift
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { site: true, shiftType: true, guard: true },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // 2. Validate Guard and Time
    if (shift.guardId !== guardId) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    if (now < shift.startsAt || now > shift.endsAt) {
      return NextResponse.json({ error: 'Shift is not active' }, { status: 400 });
    }

    // 2.5 Distance Check
    const maxDistanceStr = process.env.MAX_CHECKIN_DISTANCE_METERS;
    if (maxDistanceStr) {
      const maxDistance = parseInt(maxDistanceStr, 10);
      if (!isNaN(maxDistance) && maxDistance > 0) {
        if (!body.location || typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
          return NextResponse.json({ error: 'Location permission is required for this site.' }, { status: 400 });
        }

        if (shift.site.latitude != null && shift.site.longitude != null) {
          const distance = calculateDistance(
            body.location.lat,
            body.location.lng,
            shift.site.latitude,
            shift.site.longitude
          );

          if (distance > maxDistance) {
            return NextResponse.json(
              {
                error: `Anda berada terlalu jauh dari lokasi penugasan. Jarak saat ini: ${Math.round(
                  distance
                )}m (Maksimal: ${maxDistance}m). Silakan pindah ke lokasi yang ditentukan.`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // 3. Calculate Status using Shared Logic
    const windowResult = calculateCheckInWindow(
      shift.startsAt,
      shift.endsAt,
      shift.requiredCheckinIntervalMins,
      shift.graceMinutes,
      now,
      shift.lastHeartbeatAt
    );

    // Allow check-in only if status is 'open'
    // 'early' means waiting for next slot (or first slot)
    // 'completed' means already done
    // 'late' means missed window, but technically they can still "check in" as late?
    // The previous logic was strict: "Too late to check in".
    // "Already checked in".

    if (windowResult.status === 'completed') {
      return NextResponse.json({ error: 'Already checked in for this interval' }, { status: 400 });
    }

    if (windowResult.status === 'late') {
      return NextResponse.json({ error: 'Too late to check in for this interval' }, { status: 400 });
    }

    if (windowResult.status === 'early') {
      return NextResponse.json({ error: 'Too early to check in' }, { status: 400 });
    }

    const status: 'on_time' | 'late' = 'on_time'; // If window is 'open', it's on time.
    const isLastSlot = windowResult.nextSlotStart.getTime() > shift.endsAt.getTime();

    // 4. Transaction: Insert Checkin, Update Shift, Resolve Alerts
    const result = await prisma.$transaction(async tx => {
      const checkin = await tx.checkin.create({
        data: {
          shiftId: shift.id,
          guardId: guardId,
          status: status,
          source: body.source || 'api',
          metadata: body.location,
          at: now,
        },
      });

      const updateData = {
        lastHeartbeatAt: now,
        checkInStatus: status,
        ...(shift.status === 'scheduled' && { status: 'in_progress' as const }),
        ...(status === 'on_time' && { missedCount: 0 }),
        ...(isLastSlot && { status: 'completed' as const }),
      };

      await tx.shift.update({
        where: { id: shift.id },
        data: updateData,
      });

      return { checkin };
    });

    return NextResponse.json({
      checkin: result.checkin,
      next_due_at: windowResult.nextSlotStart,
      status,
      isLastSlot,
    });
  } catch (error: unknown) {
    console.error('Error checking in:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
