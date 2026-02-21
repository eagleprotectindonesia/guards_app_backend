import { NextResponse } from 'next/server';
import { checkInSchema } from '@/lib/validations';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { ZodError } from 'zod';
import { calculateCheckInWindow } from '@/lib/scheduling';
import { calculateDistance } from '@/lib/utils';
import { getSystemSetting } from '@/lib/data-access/settings';
import { recordCheckin, recordBulkCheckins } from '@/lib/data-access/checkins';
import { getShiftById } from '@/lib/data-access/shifts';
import { redis } from '@/lib/redis';

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

    if (now < shift.startsAt) {
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

    if (windowResult.status === 'early') {
      return NextResponse.json({ error: 'Too early to check in' }, { status: 400 });
    }

    const status: 'on_time' | 'late' = windowResult.status === 'late' ? 'late' : 'on_time';
    const isLastSlot = windowResult.isLastSlot;

    // 3.5 Calculate missed slots to record them simultaneously
    const intervalMs = shift.requiredCheckinIntervalMins * 60000;
    const graceMs = shift.graceMinutes * 60000;
    const firstDueMs = shift.startsAt.getTime() + intervalMs;
    const currentSlotStartMs = windowResult.currentSlotStart.getTime();
    const lastHeartbeatMs = shift.lastHeartbeatAt ? shift.lastHeartbeatAt.getTime() : shift.startsAt.getTime();

    const checkinsToRecord: { at: Date; status: 'on_time' | 'late'; source?: string; metadata?: unknown }[] = [];

    // Add missed slots
    let checkTime = firstDueMs;
    while (checkTime < currentSlotStartMs) {
      if (checkTime > lastHeartbeatMs) {
        // For missed slots recorded now, lateness is calculated based on current time 'now'
        // compared to the deadline (checkTime + graceMs)
        const latenessMins = Math.max(0, Math.floor((now.getTime() - (checkTime + graceMs)) / 60000));

        checkinsToRecord.push({
          at: new Date(checkTime),
          status: 'late',
          source: body.source,
          metadata: { ...body.location, autoFilled: true, latenessMins },
        });
      }
      checkTime += intervalMs;
    }

    // Add current slot
    let currentLatenessMins = 0;

    if (status === 'late') {
      currentLatenessMins = Math.max(0, Math.floor((now.getTime() - (currentSlotStartMs + graceMs)) / 60000));
    }

    checkinsToRecord.push({
      at: now,
      status,
      source: body.source,
      metadata: { ...body.location, latenessMins: currentLatenessMins },
    });

    // 4. Record Checkin and Update Shift
    const shiftUpdateData = {
      checkInStatus: status,
      ...(shift.status === 'scheduled' && { status: 'in_progress' as const }),
      ...(status === 'on_time' && { missedCount: 0 }),
      ...(isLastSlot && { status: 'completed' as const }),
    };

    let checkin;
    let resolvedAlerts: unknown[] = [];

    if (checkinsToRecord.length > 1) {
      const bulkResult = await recordBulkCheckins({
        shiftId: shift.id,
        employeeId: employeeId,
        checkins: checkinsToRecord,
        shiftUpdateData,
      });
      // For response backward compatibility, we'll return the last checkin (the actual one)
      checkin = { at: now, status };
      resolvedAlerts = bulkResult.resolvedAlerts || [];
    } else {
      const singleResult = await recordCheckin({
        shiftId: shift.id,
        employeeId: employeeId,
        status,
        source: body.source,
        metadata: { ...body.location, latenessMins: currentLatenessMins },
        now,
        shiftUpdateData,
      });
      checkin = singleResult.checkin;
      if (singleResult.resolvedAlert) {
        resolvedAlerts = [singleResult.resolvedAlert];
      }
    }

    // If alerts were auto-resolved, publish the update to Redis for real-time UI updates
    for (const alert of resolvedAlerts) {
      const payload = {
        type: 'alert_updated',
        alert,
      };
      await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));
    }

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
