import { NextResponse } from 'next/server';
import { prisma, createCalendarEvent } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { redis } from '@repo/database/redis';
import { format } from 'date-fns';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('user-calendar:create');
  const { id } = await params;

  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, adminId: session.id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
    }

    const event = await createCalendarEvent({
      adminId: session.id,
      kind: existing.kind,
      title: existing.title,
      description: existing.description ?? undefined,
      startDate: format(existing.startDate, 'yyyy-MM-dd'),
      endDate: format(existing.endDate, 'yyyy-MM-dd'),
      startTime: existing.startTime ?? undefined,
      endTime: existing.endTime ?? undefined,
      allDay: existing.allDay,
      location: existing.location ?? undefined,
      clientName: existing.clientName ?? undefined,
      trainerName: existing.trainerName ?? undefined,
      priority: existing.priority ?? undefined,
      color: existing.color ?? undefined,
    });

    redis
      .publish(
        'events:calendar',
        JSON.stringify({
          type: 'calendar:event_created',
          data: { eventId: event.id, kind: existing.kind, adminId: session.id },
        })
      )
      .catch(err => console.error('[Calendar] Redis publish error:', err));

    return NextResponse.json({ item: event }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error duplicating calendar event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
