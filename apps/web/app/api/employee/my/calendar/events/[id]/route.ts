import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { updateCalendarEventSchema } from '@repo/validations';
import { updateCalendarEvent, deleteCalendarEvent } from '@repo/database';
import { ZodError } from 'zod';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, employeeId: employee.id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
    }

    const body = updateCalendarEventSchema.parse(await req.json());

    const event = await updateCalendarEvent(id, {
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

    return NextResponse.json({ item: event });
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id, employeeId: employee.id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
    }

    await deleteCalendarEvent(id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
