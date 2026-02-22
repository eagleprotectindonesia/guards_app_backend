import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { recordHeartbeat } from '@repo/database';
import { redis } from '@/lib/redis';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { updatedShift, resolvedAlerts } = await recordHeartbeat({
      shiftId,
      employeeId: employee.id,
    });

    if (!updatedShift) {
      return NextResponse.json({ error: 'Shift not found or not assigned to you' }, { status: 404 });
    }

    // If alerts were auto-resolved, publish to Redis for dashboard updates
    for (const alert of resolvedAlerts) {
      const payload = {
        type: 'alert_updated',
        alert: {
           ...alert,
           site: updatedShift.site
        },
      };
      await redis.publish(`alerts:site:${updatedShift.siteId}`, JSON.stringify(payload));
    }

    return NextResponse.json({ success: true, lastHeartbeatAt: updatedShift.lastDeviceHeartbeatAt });
  } catch (error) {
    console.error('Error recording heartbeat:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
