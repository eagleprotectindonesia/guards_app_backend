import { NextResponse } from 'next/server';
import { findParticipantAvailabilityConflicts } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { tagAvailabilityCheckSchema } from '@repo/validations';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export async function POST(req: Request) {
  await requirePermission('user-calendar:create');

  try {
    const body = await req.json();

    const parsed = tagAvailabilityCheckSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ conflicts: {} });
    }

    const { startDate, endDate, startTime, endTime, allDay, participants, excludeEventId } = parsed.data;

    const fromDate = startOfDay(parseISO(startDate));
    const toDate = endOfDay(parseISO(endDate));

    const conflicts = await findParticipantAvailabilityConflicts({
      participants,
      fromDate,
      toDate,
      allDay,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      excludeEventId,
    });

    return NextResponse.json({ conflicts });
  } catch (error: unknown) {
    console.error('[TagAvailability] Error checking availability:', error);
    return NextResponse.json({ conflicts: {} });
  }
}
