import { NextResponse } from 'next/server';
import { resolveAlertSchema } from '@repo/validations';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { ZodError } from 'zod';
import { getShiftById, resolveAlertsByShiftAndReason, redis } from '@repo/database';

export async function POST(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const json = await req.json();
    const body = resolveAlertSchema.parse(json);

    // 1. Fetch Shift to verify ownership
    const shift = await getShiftById(body.shiftId, { site: true });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.employeeId !== employee.id) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    // 2. Resolve existing alerts of this type for this shift
    const { resolvedAlerts, count } = await resolveAlertsByShiftAndReason({
      shiftId: shift.id,
      reason: body.reason,
      resolutionNote: 'Resolved by system (Guard returned to geofence/restored location)',
    });

    if (count === 0) {
      return NextResponse.json({ message: 'No active alerts to resolve' });
    }

    // 3. Publish to Redis for real-time Socket.io updates (Best-effort)
    try {
      for (const alert of resolvedAlerts) {
        const payload = {
          type: 'alert_updated',
          alert,
        };
        await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));
      }
    } catch (redisError) {
      console.error('[Alert Resolve] Redis publish failed:', redisError);
    }

    return NextResponse.json({
      message: `${count} alert(s) resolved successfully`,
    });
  } catch (error: unknown) {
    console.error('Error resolving alert:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
