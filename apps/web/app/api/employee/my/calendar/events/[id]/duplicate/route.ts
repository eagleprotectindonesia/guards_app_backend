import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createCalendarEvent } from '@repo/database';

export async function POST(
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

    const event = await createCalendarEvent({
      employeeId: employee.id,
      kind: existing.kind,
      title: existing.title,
      description: existing.description ?? undefined,
      startDate: existing.startDate.toISOString().slice(0, 10),
      endDate: existing.endDate.toISOString().slice(0, 10),
      startTime: existing.startTime ?? undefined,
      endTime: existing.endTime ?? undefined,
      allDay: existing.allDay,
      location: existing.location ?? undefined,
      clientName: existing.clientName ?? undefined,
      trainerName: existing.trainerName ?? undefined,
      priority: existing.priority ?? undefined,
      reminderMinutesBefore: existing.reminderMinutesBefore ?? undefined,
    });

    return NextResponse.json({ item: event }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error duplicating calendar event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
