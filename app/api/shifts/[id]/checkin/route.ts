import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkInSchema } from '@/lib/validations';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { ZodError } from 'zod';

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
    // Fixed interval logic:
    // Slot N starts at: startsAt + N * interval
    // Check-in Window for Slot N: [SlotStart, SlotStart + grace]

    const nowMs = now.getTime();
    const startMs = shift.startsAt.getTime();
    const intervalMs = shift.requiredCheckinIntervalMins * 60000;
    const graceMs = shift.graceMinutes * 60000;

    // Which slot are we in?
    const currentSlotIndex = Math.floor((nowMs - startMs) / intervalMs);
    const targetTime = new Date(startMs + currentSlotIndex * intervalMs);
    const deadline = new Date(targetTime.getTime() + graceMs);

    // Validate Strict Window
    // If now > deadline, we missed the window for this slot.
    // And it is too early for the next slot.
    if (now > deadline) {
      return NextResponse.json({ error: 'Too late to check in for this interval' }, { status: 400 });
    }

    // Check if we already checked in for this slot
    // If lastHeartbeatAt >= targetTime, we have done this slot.
    if (shift.lastHeartbeatAt && shift.lastHeartbeatAt.getTime() >= targetTime.getTime()) {
      return NextResponse.json({ error: 'Already checked in for this interval' }, { status: 400 });
    }

    const status: 'on_time' | 'late' = 'on_time'; // Always on_time if within the strict window

    // 4. Transaction: Insert Checkin, Update Shift, Resolve Alerts
    const result = await prisma.$transaction(async tx => {
      const checkin = await tx.checkin.create({
        data: {
          shiftId: shift.id,
          guardId: guardId, // Use guardId instead of userId
          status: status, // Directly use the calculated status
          source: body.source || 'api',
          metadata: body.location,
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

      // Alert resolution by guard check-in is removed. Alerts are handled by admin.

      return { checkin };
    });

    // 5. Publish Realtime Events
    // No alert resolution by guard check-in. Alerts are handled by admin.

    // Calculate next due for response
    // Next due is the START of the NEXT slot
    const nextDueAfterCheckin = new Date(startMs + (currentSlotIndex + 1) * intervalMs);

    return NextResponse.json({
      checkin: result.checkin,
      next_due_at: nextDueAfterCheckin,
      status,
    });
  } catch (error: unknown) {
    console.error('Error checking in:', error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
