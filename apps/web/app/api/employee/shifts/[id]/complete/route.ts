import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getShiftById, completeShift } from '@repo/database';
import { getSystemSetting } from '@repo/database';
import { calculateDistance } from '@/lib/server-utils';
import { findNearestAllowedSiteLocation } from '@/lib/site-post-location';
import { redis } from '@repo/database/redis';
import { employeeShiftErrorResponse } from '../shared-errors';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return employeeShiftErrorResponse({ status: 401, code: 'unauthorized', error: 'Unauthorized' });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const now = new Date();

    const shift = await getShiftById(shiftId, {
      site: {
        include: {
          posts: {
            where: { status: true, deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      },
      escortEndSite: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      shiftType: true,
      employee: { include: { office: { select: { name: true } } } },
      groupShift: { select: { flexibleEndTime: true } },
    });
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    if (shift.employeeId !== employee.id) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    // Early-end guard
    if (now < shift.endsAt && !shift.groupShift?.flexibleEndTime) {
      return employeeShiftErrorResponse({
        status: 400,
        code: 'too_early_to_end',
        error: 'This shift has not ended yet',
      });
    }

    // Geofence validation (all shift kinds)
    const setting = await getSystemSetting('MAX_CHECKIN_DISTANCE_METERS');
    const maxDistanceStr = setting?.value || process.env.MAX_CHECKIN_DISTANCE_METERS;

    let matchedLocation: {
      type: 'post' | 'legacy_site' | 'escort_end';
      id: string | null;
      name: string;
      latitude: number;
      longitude: number;
      distanceMeters: number;
    } | null = null;

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

        const extraCandidates = shift.kind === 'escort' && shift.escortEndSite?.latitude != null && shift.escortEndSite?.longitude != null
          ? [{
              type: 'escort_end' as const,
              id: shift.escortEndSite.id,
              name: shift.escortEndSite.name,
              latitude: shift.escortEndSite.latitude,
              longitude: shift.escortEndSite.longitude,
            }]
          : undefined;

        const locationResult = findNearestAllowedSiteLocation({
          site: shift.site,
          employeeLocation: body.location,
          maxDistanceMeters: maxDistance,
          calculateDistance,
          extraCandidates,
        });

        matchedLocation = locationResult.matchedLocation;

        if (!matchedLocation) {
          const nearestDistance = locationResult.nearestLocation?.distanceMeters;
          return employeeShiftErrorResponse({
            status: 400,
            code: 'too_far_from_site',
            error: nearestDistance != null
              ? `You are too far from the assigned location. Current distance: ${Math.round(nearestDistance)}m (Maximum: ${maxDistance}m). Please move to the required location.`
              : 'No valid location is configured for this shift. Please contact an administrator.',
            details: {
              currentDistanceMeters: nearestDistance != null ? Math.round(nearestDistance) : null,
              maxDistanceMeters: maxDistance,
            },
          });
        }
      }
    }

    const metadata = {
      ...body.location,
      location: body.location,
      matchedLocation: matchedLocation
        ? {
            type: matchedLocation.type,
            id: matchedLocation.id,
            name: matchedLocation.name,
            distanceMeters: Math.round(matchedLocation.distanceMeters),
          }
        : undefined,
      latenessMins: 0,
      forced: true,
    };

    const { shift: updatedShift, resolvedAlerts } = await completeShift({
      shiftId,
      employeeId: employee.id,
      now,
      metadata,
    });

    await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_UPDATED', id: updatedShift.id }));

    for (const alert of resolvedAlerts) {
      await redis.publish(`alerts:site:${alert.siteId}`, JSON.stringify({ type: 'alert_updated', alert }));
    }

    await redis.publish(
      'dashboard:live-activity',
      JSON.stringify({
        item: {
          id: `end_duty:${shift.id}:${now.toISOString()}`,
          kind: 'end_duty',
          occurredAt: now.toISOString(),
          guardName: employee.fullName,
          siteName: shift.site.name,
          status: 'on_time',
          shiftId: shift.id,
          employeeId: employee.id,
        },
      })
    );

    return NextResponse.json({ shift: updatedShift }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
