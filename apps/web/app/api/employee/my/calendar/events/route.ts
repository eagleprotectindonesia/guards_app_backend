import { NextResponse } from 'next/server';
import { prisma, getCalendarEventTags, getTagsForEvents, listEmployeeCalendarEvents } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createCalendarEventSchema, updateCalendarEventSchema, calendarListSchema } from '@repo/validations';
import { createCalendarEvent, updateCalendarEvent } from '@repo/database';
import { notifyCalendarEventTags, validateTaggedUsers } from '@/lib/calendar-notifications';
import { redis } from '@repo/database/redis';
import { ZodError } from 'zod';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

function serializeEvent(event: Record<string, unknown>) {
  return {
    id: event.id,
    kind: event.kind,
    title: event.title,
    description: event.description ?? null,
    startDate: event.startDate ? String(event.startDate).slice(0, 10) : null,
    endDate: event.endDate ? String(event.endDate).slice(0, 10) : null,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    allDay: event.allDay ?? false,
    location: event.location ?? null,
    clientName: event.clientName ?? null,
    trainerName: event.trainerName ?? null,
    priority: event.priority ?? null,
    color: event.color ?? null,
    createdAt: event.createdAt ? String(event.createdAt) : null,
    updatedAt: event.updatedAt ? String(event.updatedAt) : null,
  };
}

export async function GET(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    const events = await listEmployeeCalendarEvents(employee.id, fromDate, toDate);

    const eventIds = events.map((e) => e.id);
    const tagsByEvent = await getTagsForEvents(eventIds);
    const items = events.map((e) => ({
      ...serializeEvent(e as unknown as Record<string, unknown>),
      taggedUsers: tagsByEvent[e.id] ?? [],
      isOwner: e.employeeId === employee.id,
    }));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error('Error fetching calendar events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = createCalendarEventSchema.parse(await req.json());

    const taggedEmployeeIds = (body.taggedEmployeeIds ?? []).filter((id) => id !== employee.id);
    const taggedAdminIds = body.taggedAdminIds ?? [];

    if (taggedEmployeeIds.length > 0 || taggedAdminIds.length > 0) {
      const validationErrors = await validateTaggedUsers(taggedEmployeeIds, taggedAdminIds);
      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors.join('; ') }, { status: 400 });
      }
    }

    const event = await prisma.$transaction(async (tx) => {
      return createCalendarEvent({
        employeeId: employee.id,
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
        color: body.color,
        taggedEmployeeIds,
        taggedAdminIds,
      }, tx);
    });

    if (taggedEmployeeIds.length > 0 || taggedAdminIds.length > 0) {
      await notifyCalendarEventTags(
        event.id,
        body.title,
        taggedEmployeeIds,
        taggedAdminIds,
        employee.fullName
      );
    }

    redis.publish('events:calendar', JSON.stringify({
      type: 'calendar:event_created',
      data: { eventId: event.id, kind: body.kind ?? '', employeeId: employee.id },
    })).catch((err) => console.error('[Calendar] Redis publish error:', err));

    const serialized = serializeEvent(event as unknown as Record<string, unknown>);
    const taggedUsers = await getCalendarEventTags(event.id);

    return NextResponse.json(
      { item: { ...serialized, taggedUsers, isOwner: true } },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
