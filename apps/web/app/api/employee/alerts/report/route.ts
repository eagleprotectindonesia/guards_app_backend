import { NextResponse } from 'next/server';
import { reportAlertSchema } from '@/lib/validations';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

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
    const shift = await prisma.shift.findUnique({
      where: { id: body.shiftId },
      include: { site: true },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.employeeId !== employee.id) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    // 2. Check for existing active (unresolved) alert for this shift and reason (Idempotency)
    const existingAlert = await prisma.alert.findFirst({
      where: {
        shiftId: shift.id,
        reason: body.reason,
        resolvedAt: null,
      },
      include: {
        site: true,
        shift: {
          include: {
            employee: true,
            shiftType: true,
          },
        },
      },
    });

    if (existingAlert) {
      return NextResponse.json({
        message: 'Alert already exists and is active',
        alertId: existingAlert.id,
      });
    }

    // 3. Create the Alert
    const alert = await prisma.alert.create({
      data: {
        shiftId: shift.id,
        siteId: shift.siteId,
        reason: body.reason,
        severity: 'critical',
        windowStart: now, // For reported alerts, windowStart is the time of report
        createdAt: now,
      },
      include: {
        site: true,
        shift: {
          include: {
            employee: true,
            shiftType: true,
          },
        },
      },
    });

    // 3. Publish to Redis for real-time Socket.io updates
    const payload = {
      type: 'alert_created',
      alert,
    };
    await redis.publish(`alerts:site:${shift.siteId}`, JSON.stringify(payload));

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
