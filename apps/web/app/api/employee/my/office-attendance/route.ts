import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createOfficeAttendanceSchema } from '@repo/validations';
import { calculateDistance } from '@/lib/server-utils';
import { getSystemSetting } from '@repo/database';
import { getOfficeById } from '@repo/database';
import { recordOfficeAttendance } from '@repo/database';
import { getLatestOfficeAttendanceInRange } from '@repo/database';
import { getLatestOfficeAttendanceForDay } from '@repo/database';
import { OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING } from '@repo/database';
import { resolveOfficeAttendanceContextForEmployee } from '@repo/database';
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
    const now = new Date();
    const json = await req.json();
    const body = createOfficeAttendanceSchema.parse(json);
    const requestedStatus = body.status ?? 'present';
    const scheduleContext = await resolveOfficeAttendanceContextForEmployee(employee.id, now);

    if (!scheduleContext.isWorkingDay) {
      return NextResponse.json(
        {
          code: 'not_working_day',
          error: 'Office attendance is only available on configured working days.',
        },
        { status: 400 }
      );
    }

    if (requestedStatus === 'present' && scheduleContext.isAfterEnd && scheduleContext.windowStart && scheduleContext.windowEnd) {
      return NextResponse.json(
        {
          code: 'office_hours_ended',
          error: 'Clock-in is no longer allowed after the configured office end time.',
        },
        { status: 400 }
      );
    }

    const latestAttendanceInWindow =
      scheduleContext.windowStart && scheduleContext.windowEnd
        ? await getLatestOfficeAttendanceInRange(employee.id, scheduleContext.windowStart, scheduleContext.windowEnd)
        : null;
    const latestAttendanceForDay = await getLatestOfficeAttendanceForDay(employee.id, now);
    const latestAttendance =
      requestedStatus === 'clocked_out'
        ? latestAttendanceInWindow?.status === 'present'
          ? latestAttendanceInWindow
          : latestAttendanceForDay?.status === 'present'
            ? latestAttendanceForDay
            : latestAttendanceInWindow ?? latestAttendanceForDay
        : latestAttendanceInWindow;

    if (!latestAttendance && requestedStatus === 'clocked_out') {
      return NextResponse.json(
        {
          code: 'clock_in_required',
          error: 'Clock-in is required before clock-out.',
        },
        { status: 400 }
      );
    }

    if (latestAttendance?.status === 'present' && requestedStatus === 'present') {
      return NextResponse.json(
        {
          code: 'office_attendance_already_clocked_in',
          error: 'Clock-in has already been recorded for this schedule window.',
        },
        { status: 400 }
      );
    }

    if (latestAttendance?.status === 'clocked_out') {
      return NextResponse.json(
        {
          code: 'office_attendance_completed',
          error: 'Office attendance has already been completed for this schedule window.',
        },
        { status: 400 }
      );
    }

    let office = null;
    if (!employee.fieldModeEnabled && employee.officeId) {
      office = await getOfficeById(employee.officeId);
      if (!office) {
        return NextResponse.json(
          {
            code: 'assigned_office_not_found',
            error: 'The assigned office could not be found.',
          },
          { status: 400 }
        );
      }
    }

    if (office) {
      if (!body.location || typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number') {
        return NextResponse.json(
          {
            code: 'location_required',
            error: 'Location permission is required.',
          },
          { status: 400 }
        );
      }

      if (office.latitude == null || office.longitude == null) {
        return NextResponse.json(
          {
            code: 'office_location_not_configured',
            error: 'The assigned office does not have a configured location.',
          },
          { status: 400 }
        );
      }

      const setting = await getSystemSetting(OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING);
      const maxDistanceStr = setting?.value || process.env.OFFICE_ATTENDANCE_MAX_DISTANCE_METERS;

      if (maxDistanceStr) {
        const maxDistance = parseInt(maxDistanceStr, 10);
        if (!isNaN(maxDistance) && maxDistance > 0) {
          const distance = calculateDistance(body.location.lat, body.location.lng, office.latitude, office.longitude);

          if (distance > maxDistance) {
            const currentDistanceMeters = Math.round(distance);
            return NextResponse.json(
              {
                code: 'too_far_from_office',
                error: `Anda berada terlalu jauh dari kantor. Jarak saat ini: ${currentDistanceMeters}m (Maksimal: ${maxDistance}m).`,
                details: {
                  currentDistanceMeters,
                  maxDistanceMeters: maxDistance,
                },
              },
              { status: 400 }
            );
          }
        }
      }
    }

    const latenessMins =
      requestedStatus === 'present' && scheduleContext.isLate
        ? scheduleContext.windowStart && Number.isFinite(scheduleContext.windowStart.getTime())
          ? Math.floor((now.getTime() - scheduleContext.windowStart.getTime()) / 60_000)
          : scheduleContext.startMinutes != null
            ? scheduleContext.businessDay.minutesSinceMidnight - scheduleContext.startMinutes
            : null
        : null;

    const metadata = {
      ...(body.metadata || {}),
      ...(body.location ? { location: body.location } : {}),
      ...(latenessMins != null ? { latenessMins } : {}),
    };

    const attendance = await recordOfficeAttendance({
      officeId: office?.id ?? null,
      officeShiftId: scheduleContext.shift?.id ?? null,
      employeeId: employee.id,
      status: requestedStatus,
      metadata,
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
