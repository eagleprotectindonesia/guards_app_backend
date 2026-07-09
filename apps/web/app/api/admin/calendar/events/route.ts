import { NextResponse } from 'next/server';
import { prisma, getCalendarEventTags, getTagsForEvents } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { createCalendarEventSchema, calendarListSchema } from '@repo/validations';
import { createCalendarEvent } from '@repo/database';
import { serializeCalendarEvent } from '@repo/shared';
import { getAdminName, notifyCalendarEventTags, validateTaggedUsers } from '@/lib/calendar-notifications';
import { redis } from '@repo/database/redis';
import { ZodError } from 'zod';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export async function GET(req: Request) {
  const { id: adminId, isSuperAdmin } = await requirePermission('user-calendar:view');

  try {
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const parsed = calendarListSchema.safeParse({ from: fromParam, to: toParam });
    if (!parsed.success) {
      return NextResponse.json({ error: 'from and to query parameters are required (YYYY-MM-DD)' }, { status: 400 });
    }

    const fromDate = startOfDay(parseISO(parsed.data.from));
    const toDate = endOfDay(parseISO(parsed.data.to));

    const adminWhere: Record<string, unknown> = {
      deletedAt: null,
      endDate: { gte: fromDate },
      startDate: { lte: toDate },
    };
    if (isSuperAdmin) {
      adminWhere.adminId = { not: null };
    } else {
      adminWhere.OR = [
        { adminId },
        { tags: { some: { adminId, participantType: 'admin' } } },
      ];
    }

    const [events, adminName] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: adminWhere as Record<string, unknown>,
        orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
      }),
      getAdminName(adminId),
    ]);

    const eventIds = events.map(e => e.id);
    const tagsByEvent = await getTagsForEvents(eventIds);
    const items = events.map(e => ({
      ...serializeCalendarEvent(e as unknown as Record<string, unknown>),
      taggedUsers: tagsByEvent[e.id] ?? [],
      isOwner: e.adminId === adminId,
      ownerId: e.adminId ?? adminId,
      ownerType: 'admin' as const,
      ownerName: adminName,
    }));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error('Error fetching admin calendar events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await requirePermission('user-calendar:create');

  try {
    const body = createCalendarEventSchema.parse(await req.json());

    const taggedEmployeeIds = body.taggedEmployeeIds ?? [];
    const taggedAdminIds = body.taggedAdminIds ?? [];

    if (taggedEmployeeIds.length > 0 || taggedAdminIds.length > 0) {
      const validationErrors = await validateTaggedUsers(taggedEmployeeIds, taggedAdminIds);
      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors.join('; ') }, { status: 400 });
      }
    }

    const adminName = await getAdminName(session.id);

    const event = await prisma.$transaction(async tx => {
      return createCalendarEvent(
        {
          adminId: session.id,
          kind: body.kind,
          title: body.title,
          description: body.description,
          startDate: body.startDate,
          endDate: body.endDate,
          startTime: body.startTime,
          endTime: body.endTime,
          allDay: body.allDay,
          location: body.location,
          clientName: body.clientName,
          trainerName: body.trainerName,
          priority: body.priority,
          taggedEmployeeIds,
          taggedAdminIds,
        },
        tx
      );
    });

    if (taggedEmployeeIds.length > 0 || taggedAdminIds.length > 0) {
      await notifyCalendarEventTags(event.id, body.title, taggedEmployeeIds, taggedAdminIds, adminName);
    }

    redis
      .publish(
        'events:calendar',
        JSON.stringify({
          type: 'calendar:event_created',
          data: { eventId: event.id, kind: body.kind ?? '', adminId: session.id },
        })
      )
      .catch(err => console.error('[Calendar] Redis publish error:', err));

    const serialized = serializeCalendarEvent(event as unknown as Record<string, unknown>);
    const taggedUsers = await getCalendarEventTags(event.id);

    return NextResponse.json(
      {
        item: {
          ...serialized,
          taggedUsers,
          isOwner: true,
          ownerId: session.id,
          ownerType: 'admin',
          ownerName: adminName,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
