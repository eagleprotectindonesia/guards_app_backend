import { NextResponse } from 'next/server';
import { checkInSchema } from '@repo/validations';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { ZodError } from 'zod';
import { calculateCheckInWindow } from '@/lib/scheduling';
import { calculateDistance } from '@/lib/server-utils';
import { getSystemSetting } from '@repo/database';
import { recordCheckin, recordBulkCheckins } from '@repo/database';
import { getShiftById } from '@repo/database';
import { redis } from '@repo/database/redis';
import { employeeShiftErrorResponse } from '../shared-errors';
import { findNearestAllowedSiteLocation } from '@/lib/site-post-location';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return employeeShiftErrorResponse({ status: 401, code: 'unauthorized', error: 'Unauthorized' });
  }
  const employeeId = employee.id;

  try {
    const json = await req.json();
    const body = checkInSchema.parse(json);
    const now = new Date();

    // 1. Fetch Shift
    const shift = await getShiftById(shiftId);

    if (!shift) {
      return employeeShiftErrorResponse({ status: 404, code: 'shift_not_found', error: 'Shift not found' });
    }

    // 2. Validate Employee and Time
    if (shift.employeeId !== employeeId) {
      return employeeShiftErrorResponse({ status: 403, code: 'shift_not_assigned', error: 'Not assigned to this shift' });
    }

    if (now < shift.startsAt) {
      return employeeShiftErrorResponse({ status: 400, code: 'shift_not_active', error: 'Shift is not active' });
    }

    // 2.5 Distance Check
    const setting = await getSystemSetting('MAX_CHECKIN_DISTANCE_METERS');
    const maxDistanceStr = setting?.value || process.env.MAX_CHECKIN_DISTANCE_METERS;

    let matchedLocation:
      | {
          type: 'post' | 'legacy_site';
          id: string | null;
          name: string;
          latitude: number;
          longitude: number;
          distanceMeters: number;
        }
      | null = null;

    if (maxDistanceStr) {
      const maxDistance = parseInt(maxDistanceStr, 10);
      if (!isNaN(maxDistance) && maxDistance > 0) {
        if (!body.location || typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
          return employeeShiftErrorResponse({
            status: 400,
            code: 'location_required',
            error: 'Location permission is required for this site.',
          });
        }

        const locationResult = findNearestAllowedSiteLocation({
          site: shift.site,
          employeeLocation: body.location,
          maxDistanceMeters: maxDistance,
          calculateDistance,
        });

        matchedLocation = locationResult.matchedLocation;

        if (!matchedLocation) {
          const nearestDistance = locationResult.nearestLocation?.distanceMeters;
          return employeeShiftErrorResponse({
            status: 400,
            code: 'too_far_from_site',
            error:
              nearestDistance != null
                ? `You are too far from the assigned site. Current distance: ${Math.round(
                    nearestDistance
                  )}m (Maximum: ${maxDistance}m). Please move to the required location.`
                : 'No valid location is configured for this site. Please contact an administrator.',
            details: {
              currentDistanceMeters: nearestDistance != null ? Math.round(nearestDistance) : null,
              maxDistanceMeters: maxDistance,
            },
          });
        }
      }
    }

    const matchedLocationMetadata = matchedLocation
      ? {
          matchedLocation: {
            type: matchedLocation.type,
            id: matchedLocation.id,
            name: matchedLocation.name,
            distanceMeters: Math.round(matchedLocation.distanceMeters),
          },
        }
      : {};

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
      return employeeShiftErrorResponse({
        status: 400,
        code: 'checkin_interval_completed',
        error: 'Already checked in for this interval',
      });
    }

    if (windowResult.status === 'early') {
      return employeeShiftErrorResponse({ status: 400, code: 'checkin_too_early', error: 'Too early to check in' });
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
          metadata: { ...body.location, location: body.location, ...matchedLocationMetadata, autoFilled: true, latenessMins },
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
      metadata: { ...body.location, location: body.location, ...matchedLocationMetadata, latenessMins: currentLatenessMins },
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
        metadata: { ...body.location, location: body.location, ...matchedLocationMetadata, latenessMins: currentLatenessMins },
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

    // Notify the worker to re-sync active shifts (triggers marker color update on map)
    await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_UPDATED', id: shift.id }));

    await redis.publish(
      'dashboard:live-activity',
      JSON.stringify({
        item: {
          id: `checkin:${checkin.id ?? `${shift.id}:${now.toISOString()}`}`,
          kind: 'checkin',
          occurredAt: now.toISOString(),
          guardName: employee.fullName,
          siteName: shift.site.name,
          status,
          shiftId: shift.id,
          employeeId,
        },
      })
    );

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
    return employeeShiftErrorResponse({
      status: 500,
      code: 'internal_server_error',
      error: 'Internal Server Error',
    });
  }
}
