import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createCalendarEventSchema, updateCalendarEventSchema } from '@repo/validations';
import { createCalendarEvent, updateCalendarEvent } from '@repo/database';
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
        employeeId: employee.id,
        deletedAt: null,
        endDate: { gte: fromDate },
        startDate: { lte: toDate },
      },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    });

    const items = events.map(e => serializeEvent(e as unknown as Record<string, unknown>));

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
    });

    return NextResponse.json({ item: serializeEvent(event as unknown as Record<string, unknown>) }, { status: 201 });
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
