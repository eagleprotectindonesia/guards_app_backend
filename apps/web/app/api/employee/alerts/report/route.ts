import { NextResponse } from 'next/server';
import { reportAlertSchema } from '@repo/validations';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { ZodError } from 'zod';
import { getShiftById, findOpenAlertByShiftAndReason, createAlert, redis } from '@repo/database';

export async function POST(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const json = await req.json();
    const body = reportAlertSchema.parse(json);
    const now = new Date();

    // 1. Fetch Shift to verify ownership and get siteId
    const shift = await getShiftById(body.shiftId, { site: true });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.employeeId !== employee.id) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    // 2. Check for existing active (unresolved) alert for this shift and reason (Idempotency)
    const existingAlert = await findOpenAlertByShiftAndReason(shift.id, body.reason);

    if (existingAlert) {
      return NextResponse.json({
        message: 'Alert already exists and is active',
        alertId: existingAlert.id,
      });
    }

    // 3. Create the Alert
    const alert = await createAlert({
      shiftId: shift.id,
      siteId: shift.siteId,
      reason: body.reason,
      severity: 'critical',
      windowStart: now,
    });

    // 4. Publish to Redis for real-time Socket.io updates (Best-effort)
    try {
      const payload = {
        type: 'alert_created',
        alert,
      };
      await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));
    } catch (redisError) {
      console.error('[Alert Report] Redis publish failed:', redisError);
    }

    return NextResponse.json({
      message: 'Alert reported successfully',
      alertId: alert.id,
    });
  } catch (error: unknown) {
    console.error('Error reporting alert:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
