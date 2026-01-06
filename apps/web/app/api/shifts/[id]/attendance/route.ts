import { NextResponse } from 'next/server';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { z } from 'zod'; // Import z for Zod validation
import { calculateDistance } from '@/lib/utils';
import { getSystemSetting } from '@/lib/data-access/settings';
import { recordAttendance } from '@/lib/data-access/attendance';
import { getShiftById } from '@/lib/data-access/shifts';

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

  const guard = await getAuthenticatedGuard();
  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const guardId = guard.id;

  try {
    const json = await req.json();
    const parsedBody = attendanceSchema.parse(json); // Use parsedBody for type-safe access

    // 1. Fetch Shift
    const shift = await getShiftById(shiftId, { attendance: true, site: true });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // 2. Validate Guard and ensure attendance hasn't been recorded
    if (shift.guardId !== guardId) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    if (shift.attendance) {
      return NextResponse.json({ error: 'Attendance already recorded for this shift' }, { status: 400 });
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
          return NextResponse.json({ error: 'Location permission is required for this site.' }, { status: 400 });
        }

        if (shift.site.latitude != null && shift.site.longitude != null) {
          const distance = calculateDistance(
            parsedBody.location.lat,
            parsedBody.location.lng,
            shift.site.latitude,
            shift.site.longitude
          );
          console.log(distance);

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

    // Prepare metadata if location data is present
    const metadata = parsedBody.location ? { location: parsedBody.location } : undefined;

    // 3. Record Attendance and Update Shift
    const attendance = await recordAttendance({
      shiftId: shift.id,
      guardId: shift.guardId!,
      status: 'present',
      metadata,
      updateShiftStatus: shift.status === 'scheduled',
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error recording attendance:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}