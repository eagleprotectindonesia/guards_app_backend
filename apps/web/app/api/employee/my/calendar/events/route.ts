import { NextResponse } from 'next/server';
import { prisma, getCalendarEventTags } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createCalendarEventSchema, updateCalendarEventSchema } from '@repo/validations';
import { createCalendarEvent, updateCalendarEvent } from '@repo/database';
import { notifyCalendarEventTags, validateTaggedUsers } from '@/lib/calendar-notifications';
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

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: 'from and to query parameters are required' }, { status: 400 });
    }

    const fromDate = startOfDay(parseISO(fromParam));
    const toDate = endOfDay(parseISO(toParam));

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const events = await prisma.calendarEvent.findMany({
      where: {
        deletedAt: null,
        endDate: { gte: fromDate },
        startDate: { lte: toDate },
        OR: [
          { employeeId: employee.id },
          { tags: { some: { employeeId: employee.id, participantType: 'employee' } } },
        ],
      },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    });

    const items = await Promise.all(
      events.map(async (e) => {
        const serialized = serializeEvent(e as unknown as Record<string, unknown>);
        const taggedUsers = await getCalendarEventTags(e.id);
        return { ...serialized, taggedUsers, isOwner: e.employeeId === employee.id };
      })
    );

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

    const event = await createCalendarEvent({
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
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
