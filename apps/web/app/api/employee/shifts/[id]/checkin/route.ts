import { NextResponse } from 'next/server';
import { checkInSchema } from '@/lib/validations';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { ZodError } from 'zod';
import { calculateCheckInWindow } from '@/lib/scheduling';
import { calculateDistance } from '@/lib/utils';
import { getSystemSetting } from '@/lib/data-access/settings';
import { recordCheckin } from '@/lib/data-access/checkins';
import { getShiftById } from '@/lib/data-access/shifts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const employeeId = employee.id;

  try {
    const json = await req.json();
    const body = checkInSchema.parse(json);
    const now = new Date();

    // 1. Fetch Shift
    const shift = await getShiftById(shiftId);

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // 2. Validate Employee and Time
    if (shift.employeeId !== employeeId) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    const allowedEndTime = new Date(shift.endsAt.getTime() + shift.graceMinutes * 60 * 1000);
    if (now < shift.startsAt || now > allowedEndTime) {
      return NextResponse.json({ error: 'Shift is not active' }, { status: 400 });
    }

    // 2.5 Distance Check
    const setting = await getSystemSetting('MAX_CHECKIN_DISTANCE_METERS');
    const maxDistanceStr = setting?.value || process.env.MAX_CHECKIN_DISTANCE_METERS;

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
    const isLastSlot = windowResult.isLastSlot;

    // 4. Record Checkin and Update Shift
    const checkin = await recordCheckin({
      shiftId: shift.id,
      employeeId: employeeId,
      status,
      source: body.source,
      metadata: body.location,
      now,
      shiftUpdateData: {
        checkInStatus: status,
        ...(shift.status === 'scheduled' && { status: 'in_progress' as const }),
        ...(status === 'on_time' && { missedCount: 0 }),
        ...(isLastSlot && { status: 'completed' as const }),
      },
    });

    return NextResponse.json({
      checkin,
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