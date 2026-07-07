import { NextResponse } from 'next/server';
import { prisma, getCalendarEventTags } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';

const EVENT_KINDS = [
  'meeting', 'client_meeting', 'reminder', 'task', 'deadline',
  'follow_up', 'training', 'personal_event', 'other',
] as const;

type CalendarType = 'holiday' | 'office_memo' | 'leave' | (typeof EVENT_KINDS)[number];

const VALID_TYPES: CalendarType[] = ['holiday', 'office_memo', 'leave', ...EVENT_KINDS];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { type, id } = await params;

  if (!VALID_TYPES.includes(type as CalendarType)) {
    return NextResponse.json({ error: 'Invalid calendar item type' }, { status: 400 });
  }

  try {
    let data: Record<string, unknown> | null = null;

    switch (type as CalendarType) {
      case 'holiday': {
        const holiday = await prisma.holidayCalendarEntry.findUnique({
          where: { id },
        });
        data = holiday as unknown as Record<string, unknown>;
        break;
      }

      case 'office_memo': {
        const memo = await prisma.officeMemo.findUnique({
          where: { id },
        });
        data = memo as unknown as Record<string, unknown>;
        break;
      }

      case 'leave': {
        const leave = await prisma.employeeLeaveRequest.findFirst({
          where: { id, employeeId: employee.id },
        });
        data = leave as unknown as Record<string, unknown>;
        break;
      }

      default: {
        const event = await prisma.calendarEvent.findFirst({
          where: {
            id,
            deletedAt: null,
            OR: [
              { employeeId: employee.id },
              { tags: { some: { employeeId: employee.id, participantType: 'employee' } } },
            ],
          },
        });
        if (event) {
          const tags = await getCalendarEventTags(event.id);
          data = {
            ...(event as unknown as Record<string, unknown>),
            taggedUsers: tags,
            isOwner: event.employeeId === employee.id,
          };
        }
        break;
      }
    }

    if (!data) {
      return NextResponse.json({ error: 'Calendar item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: { kind: type, data } });
  } catch (error: unknown) {
    console.error(`Error fetching calendar item ${type}/${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
