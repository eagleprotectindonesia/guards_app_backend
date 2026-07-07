import { NextResponse } from 'next/server';
import { prisma, getCalendarEventTags } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { updateCalendarEventSchema } from '@repo/validations';
import { updateCalendarEvent, deleteCalendarEvent } from '@repo/database';
import { notifyCalendarEventTags, validateTaggedUsers } from '@/lib/calendar-notifications';
import { redis } from '@repo/database/redis';
import { ZodError } from 'zod';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const taggedEmployeeIds =
      body.taggedEmployeeIds !== undefined
        ? (body.taggedEmployeeIds ?? []).filter(uid => uid !== employee.id)
        : undefined;
    const taggedAdminIds = body.taggedAdminIds;

    if ((taggedEmployeeIds && taggedEmployeeIds.length > 0) || (taggedAdminIds && taggedAdminIds.length > 0)) {
      const validationErrors = await validateTaggedUsers(taggedEmployeeIds ?? [], taggedAdminIds ?? []);
      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors.join('; ') }, { status: 400 });
      }
    }

    const oldTags = await getCalendarEventTags(id);
    const oldEmployeeIds = oldTags.filter(t => t.type === 'employee').map(t => t.id);
    const oldAdminIds = oldTags.filter(t => t.type === 'admin').map(t => t.id);

    const newEmployeeIds = taggedEmployeeIds ?? oldEmployeeIds;
    const newAdminIds = taggedAdminIds ?? oldAdminIds;

    const event = await prisma.$transaction(async tx => {
      return updateCalendarEvent(
        id,
        {
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
          taggedEmployeeIds: newEmployeeIds,
          taggedAdminIds: newAdminIds,
        },
        tx
      );
    });

    const newlyTaggedEmployees = newEmployeeIds.filter(uid => !oldEmployeeIds.includes(uid));
    const newlyTaggedAdmins = newAdminIds.filter(uid => !oldAdminIds.includes(uid));

    if (newlyTaggedEmployees.length > 0 || newlyTaggedAdmins.length > 0) {
      await notifyCalendarEventTags(
        id,
        body.title ?? existing.title,
        newlyTaggedEmployees,
        newlyTaggedAdmins,
        employee.fullName
      );
    }

    redis
      .publish(
        'events:calendar',
        JSON.stringify({
          type: 'calendar:event_updated',
          data: { eventId: id, employeeId: employee.id },
        })
      )
      .catch(err => console.error('[Calendar] Redis publish error:', err));

    const taggedUsers = await getCalendarEventTags(id);

    return NextResponse.json({
      item: {
        ...(event as unknown as Record<string, unknown>),
        taggedUsers,
        isOwner: true,
        ownerId: employee.id,
        ownerType: 'employee',
        ownerName: employee.fullName,
      },
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    redis
      .publish(
        'events:calendar',
        JSON.stringify({
          type: 'calendar:event_deleted',
          data: { eventId: id, employeeId: employee.id },
        })
      )
      .catch(err => console.error('[Calendar] Redis publish error:', err));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting calendar event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
