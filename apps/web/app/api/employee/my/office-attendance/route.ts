import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createOfficeAttendanceSchema } from '@/lib/validations';
import { calculateDistance } from '@/lib/utils';
import { getSystemSetting } from '@/lib/data-access/settings';
import { getOfficeById } from '@/lib/data-access/offices';
import { recordOfficeAttendance } from '@/lib/data-access/office-attendance';
import { ZodError } from 'zod';

export async function POST(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Ensure role is correctly checked (it might be an enum value)
  if (employee.role !== 'office') {
    return NextResponse.json({ error: 'Only office employees can use this endpoint' }, { status: 403 });
  }

  try {
    const json = await req.json();
    const body = createOfficeAttendanceSchema.parse(json);

    // 1. Fetch Office
    const office = await getOfficeById(body.officeId);

    if (!office) {
      return NextResponse.json({ error: 'Office not found' }, { status: 404 });
    }

    // 2. Distance Check
    const setting = await getSystemSetting('MAX_CHECKIN_DISTANCE_METERS');
    const maxDistanceStr = setting?.value || process.env.MAX_CHECKIN_DISTANCE_METERS;

    if (maxDistanceStr) {
      const maxDistance = parseInt(maxDistanceStr, 10);
      if (!isNaN(maxDistance) && maxDistance > 0) {
        if (!body.location || typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
          return NextResponse.json({ error: 'Location permission is required.' }, { status: 400 });
        }

        if (office.latitude != null && office.longitude != null) {
          const distance = calculateDistance(
            body.location.lat,
            body.location.lng,
            office.latitude,
            office.longitude
          );

          if (distance > maxDistance) {
            return NextResponse.json(
              {
                error: `Anda berada terlalu jauh dari kantor. Jarak saat ini: ${Math.round(
                  distance
                )}m (Maksimal: ${maxDistance}m).`,
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // 3. Record Attendance
    const attendance = await recordOfficeAttendance({
      officeId: office.id,
      employeeId: employee.id,
      status: 'present',
      metadata: body.location ? { location: body.location, ...body.metadata } : body.metadata,
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error recording office attendance:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
