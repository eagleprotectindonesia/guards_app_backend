import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { z } from 'zod'; // Import z for Zod validation
import { calculateDistance } from '@/lib/server-utils';
import { getSystemSetting } from '@repo/database';
import { recordAttendance } from '@repo/database';
import { getShiftById } from '@repo/database';
import { redis } from '@repo/database/redis';
import { ATTENDANCE_REQUIRE_PHOTO_SETTING } from '@repo/shared';
import { employeeShiftErrorResponse } from '../shared-errors';
import { findNearestAllowedSiteLocation } from '@/lib/site-post-location';

// Define a schema for the incoming request body
const attendanceSchema = z.object({
  shiftId: z.string().uuid(),
  validateOnly: z.boolean().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  picture: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return employeeShiftErrorResponse({ status: 401, code: 'unauthorized', error: 'Unauthorized' });
  }
  const employeeId = employee.id;

  try {
    const json = await req.json();
    const parsedBody = attendanceSchema.parse(json); // Use parsedBody for type-safe access
    const requirePhotoSetting = await getSystemSetting(ATTENDANCE_REQUIRE_PHOTO_SETTING);
    const requirePhotoForAttendance = requirePhotoSetting?.value === '1';

    // 1. Fetch Shift
    const shift = await getShiftById(shiftId, {
      attendance: true,
      site: {
        include: {
          posts: {
            where: {
              status: true,
              deletedAt: null,
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      },
    });

    if (!shift) {
      return employeeShiftErrorResponse({ status: 404, code: 'shift_not_found', error: 'Shift not found' });
    }

    // 2. Validate Employee and ensure attendance hasn't been recorded
    if (shift.employeeId !== employeeId) {
      return employeeShiftErrorResponse({ status: 403, code: 'shift_not_assigned', error: 'Not assigned to this shift' });
    }

    if (shift.attendance) {
      return employeeShiftErrorResponse({
        status: 400,
        code: 'attendance_already_recorded',
        error: 'Attendance already recorded for this shift',
      });
    }

    if (!parsedBody.validateOnly && requirePhotoForAttendance && !parsedBody.picture) {
      return employeeShiftErrorResponse({
        status: 400,
        code: 'photo_required',
        error: 'Attendance photo is required to record attendance.',
      });
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
        if (
          !parsedBody.location ||
          typeof parsedBody.location.lat !== 'number' ||
          typeof parsedBody.location.lng !== 'number'
        ) {
          return employeeShiftErrorResponse({
            status: 400,
            code: 'location_required',
            error: 'Location permission is required for this site.',
          });
        }

        const locationResult = findNearestAllowedSiteLocation({
          site: shift.site,
          employeeLocation: parsedBody.location,
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

    if (parsedBody.validateOnly) {
      return NextResponse.json({ validated: true }, { status: 200 });
    }

    // Determine if late
    const now = new Date();
    const ATTENDANCE_GRACE_MINS = 5;
    const graceMs = ATTENDANCE_GRACE_MINS * 60000;
    const deadlineMs = shift.startsAt.getTime() + graceMs;
    const isLate = now.getTime() > deadlineMs;
    const status: 'present' | 'late' = isLate ? 'late' : 'present';

    let latenessMins = 0;
    if (isLate) {
      latenessMins = Math.max(0, Math.floor((now.getTime() - deadlineMs) / 60000));
    }

    // Prepare metadata if location data is present
    const metadata = {
      ...(parsedBody.metadata ?? {}),
      ...(parsedBody.location ? { location: parsedBody.location } : {}),
      ...(matchedLocation
        ? {
            matchedLocation: {
              type: matchedLocation.type,
              id: matchedLocation.id,
              name: matchedLocation.name,
              distanceMeters: Math.round(matchedLocation.distanceMeters),
            },
          }
        : {}),
      ...(isLate ? { latenessMins } : {}),
    };

    // 3. Record Attendance and Update Shift
    const { attendance, resolvedAlert } = await recordAttendance({
      shiftId: shift.id,
      employeeId: shift.employeeId!,
      status,
      picture: parsedBody.picture,
      metadata,
      updateShiftStatus: shift.status === 'scheduled',
    });

    // If an alert was auto-resolved, publish the update to Redis for real-time UI updates
    if (resolvedAlert) {
      const payload = {
        type: 'alert_updated',
        alert: resolvedAlert,
      };
      await redis.publish(`alerts:site:${resolvedAlert.siteId}`, JSON.stringify(payload));
    }

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error recording attendance:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return employeeShiftErrorResponse({
      status: 500,
      code: 'internal_server_error',
      error: 'Internal Server Error',
    });
  }
}
