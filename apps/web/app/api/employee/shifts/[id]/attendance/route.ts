import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { z } from 'zod'; // Import z for Zod validation
import { calculateDistance } from '@/lib/server-utils';
import { getSystemSetting } from '@repo/database';
import { recordAttendance } from '@repo/database';
import { getShiftById } from '@repo/database';
import { redis } from '@repo/database';
import { employeeShiftErrorResponse } from '../shared-errors';

// Define a schema for the incoming request body
const attendanceSchema = z.object({
  shiftId: z.string().uuid(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
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

    // 1. Fetch Shift
    const shift = await getShiftById(shiftId, { attendance: true, site: true });

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

    // 2.5 Distance Check
    const setting = await getSystemSetting('MAX_CHECKIN_DISTANCE_METERS');
    const maxDistanceStr = setting?.value || process.env.MAX_CHECKIN_DISTANCE_METERS;

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

        if (shift.site.latitude != null && shift.site.longitude != null) {
          const distance = calculateDistance(
            parsedBody.location.lat,
            parsedBody.location.lng,
            shift.site.latitude,
            shift.site.longitude
          );

          if (distance > maxDistance) {
            return employeeShiftErrorResponse({
              status: 400,
              code: 'too_far_from_site',
              error: `You are too far from the assigned site. Current distance: ${Math.round(
                distance
              )}m (Maximum: ${maxDistance}m). Please move to the required location.`,
              details: {
                currentDistanceMeters: Math.round(distance),
                maxDistanceMeters: maxDistance,
              },
            });
          }
        }
      }
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
      ...(parsedBody.location ? { location: parsedBody.location } : {}),
      ...(isLate ? { latenessMins } : {}),
    };

    // 3. Record Attendance and Update Shift
    const { attendance, resolvedAlert } = await recordAttendance({
      shiftId: shift.id,
      employeeId: shift.employeeId!,
      status,
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
