import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { checkInSchema } from '@/lib/validations';
import { getAuthenticatedGuard } from '@/lib/guard-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const guard = await getAuthenticatedGuard();
  if (!guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const guardId = guard.id;

  try {
    const json = await req.json();
    const body = checkInSchema.parse(json);
    const now = new Date();

    // 1. Fetch Shift
    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { site: true, shiftType: true, guard: true },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // 2. Validate Guard and Time
    if (shift.guardId !== guardId) {
      return NextResponse.json({ error: 'Not assigned to this shift' }, { status: 403 });
    }

    if (now < shift.startsAt || now > shift.endsAt) {
      return NextResponse.json({ error: 'Shift is not active' }, { status: 400 });
    }

    // 3. Calculate Status
    // due = max(last_heartbeat_at, starts_at) + interval
    const lastHeartbeat = shift.lastHeartbeatAt || shift.startsAt;
    const nextDue = new Date(lastHeartbeat.getTime() + shift.requiredCheckinIntervalMins * 60000);
    const gracePeriodEnd = new Date(nextDue.getTime() + shift.graceMinutes * 60000);

    // New: Validate check-in time window
    if (now < nextDue) {
      return NextResponse.json({ error: 'Too early to check in for this interval' }, { status: 400 });
    }
    if (now > gracePeriodEnd) {
      return NextResponse.json({ error: 'Too late to check in for this interval' }, { status: 400 });
    }

    let status: 'on_time' | 'late' = 'on_time';
    if (now > nextDue) {
      // If check-in is after nextDue, it's late within the grace period
      status = 'late';
    }

    // 4. Transaction: Insert Checkin, Update Shift, Resolve Alerts
    const result = await prisma.$transaction(async tx => {
      const checkin = await tx.checkin.create({
        data: {
          shiftId: shift.id,
          guardId: guardId, // Use guardId instead of userId
          status: status, // Directly use the calculated status
          source: body.source || 'api',
          metadata: body.location as any,
          at: now,
        },
      });

      const updateData: any = {
        lastHeartbeatAt: now,
        checkInStatus: status, // Set the shift's latest check-in status
      };

      if (shift.status === 'scheduled') {
        // If it's the first check-in, set shift to in_progress
        updateData.status = 'in_progress';
      }

      if (status === 'on_time') {
        updateData.missedCount = 0;
      }
      // If late, we don't increment missedCount here per se, the worker handles misses.
      // But the text says "If on_time: reset shifts.missed_count = 0".
      // It implies missed_count is tracked by the worker.

      await tx.shift.update({
        where: { id: shift.id },
        data: updateData,
      });

      let resolvedAlert = null;
      if (status === 'on_time') {
        // Auto-resolve open alert
        // Find latest open alert for this shift
        const openAlert = await tx.alert.findFirst({
          where: {
            shiftId: shift.id,
            reason: 'missed_checkin',
            resolvedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (openAlert) {
          resolvedAlert = await tx.alert.update({
            where: { id: openAlert.id },
            data: {
              resolvedAt: now,
              resolvedById: guardId, // Auto-resolved by guard action
            },
          });
        }
      }

      return { checkin, resolvedAlert: null }; // Removed alert resolution by guard
    });

    // 5. Publish Realtime Events
    // Removed alert resolution publishing here, as guards no longer resolve alerts

    // Calculate next due for response
    const nextDueAfterCheckin = new Date(now.getTime() + shift.requiredCheckinIntervalMins * 60000);

    return NextResponse.json({
      checkin: result.checkin,
      next_due_at: nextDueAfterCheckin,
      status,
    });
  } catch (error: any) {
    console.error('Error checking in:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
