import { NextResponse } from 'next/server';
import { resolveAlertSchema } from '@/lib/validations';
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
    const body = resolveAlertSchema.parse(json);
    const now = new Date();

    // 1. Fetch Shift to verify ownership
    const shift = await prisma.shift.findUnique({
      where: { id: body.shiftId },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.employeeId !== employee.id) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    // 2. Resolve existing alerts of this type for this shift
    const alertsToResolve = await prisma.alert.findMany({
      where: {
        shiftId: shift.id,
        reason: body.reason,
        resolvedAt: null,
      },
    });

    if (alertsToResolve.length === 0) {
      return NextResponse.json({ message: 'No active alerts to resolve' });
    }

    const updatedAlerts = await Promise.all(
      alertsToResolve.map((alert) =>
        prisma.alert.update({
          where: { id: alert.id },
          data: {
            resolvedAt: now,
            resolutionType: 'auto',
            resolutionNote: 'Resolved by system (Guard returned to geofence/restored location)',
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
        })
      )
    );

    // 3. Publish to Redis for real-time Socket.io updates (Best-effort)
    try {
      for (const alert of updatedAlerts) {
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
      message: `${updatedAlerts.length} alert(s) resolved successfully`,
    });
  } catch (error: unknown) {
    console.error('Error resolving alert:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}