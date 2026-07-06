import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getShiftById, completeShift } from '@repo/database';
import { getSystemSetting } from '@repo/database';
import { calculateDistance } from '@/lib/server-utils';
import { redis } from '@repo/database/redis';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const shift = await getShiftById(shiftId);
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    if (shift.employeeId !== employee.id) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    // Location validation for escort and event shifts
    if (shift.kind === 'escort' || shift.kind === 'event_temporary') {
      const setting = await getSystemSetting('MAX_CHECKIN_DISTANCE_METERS');
      const maxDistanceStr = setting?.value || process.env.MAX_CHECKIN_DISTANCE_METERS;

      if (maxDistanceStr) {
        const maxDistance = parseInt(maxDistanceStr, 10);
        if (!isNaN(maxDistance) && maxDistance > 0) {
          const body = await req.json().catch(() => ({}));

          if (!body.location || typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
            return NextResponse.json({
              code: 'location_required',
              error: 'Location permission is required for this site.',
            }, { status: 400 });
          }

          let targetLat: number | null | undefined;
          let targetLng: number | null | undefined;

          if (shift.kind === 'escort') {
            targetLat = shift.escortEndSite?.latitude ?? shift.site?.latitude;
            targetLng = shift.escortEndSite?.longitude ?? shift.site?.longitude;
          } else {
            targetLat = shift.site?.latitude;
            targetLng = shift.site?.longitude;
          }

          if (targetLat != null && targetLng != null) {
            const distanceMeters = calculateDistance(
              body.location.lat,
              body.location.lng,
              targetLat,
              targetLng
            );

            if (distanceMeters > maxDistance) {
              return NextResponse.json({
                code: 'too_far_from_site',
                error: `You are too far from the assigned location. Current distance: ${Math.round(distanceMeters)}m (Maximum: ${maxDistance}m). Please move to the required location.`,
                details: {
                  currentDistanceMeters: Math.round(distanceMeters),
                  maxDistanceMeters: maxDistance,
                },
              }, { status: 400 });
            }
          }
        }
      }
    }

    const updatedShift = await completeShift(shiftId, employee.id);

    await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_UPDATED', id: updatedShift.id }));

    return NextResponse.json({ shift: updatedShift }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
