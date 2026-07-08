import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';

const VALID_TYPES = [
  'holiday',
  'office_memo',
  'leave',
  'meeting',
  'client_meeting',
  'reminder',
  'task',
  'deadline',
  'follow_up',
  'training',
  'personal_event',
  'other',
] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { id: adminId, isSuperAdmin } = await requirePermission('user-calendar:view');

  const { type, id } = await params;

  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid calendar item type' }, { status: 400 });
  }

  try {
    let data: Record<string, unknown> | null = null;

    if (type === 'holiday') {
      const holiday = await prisma.holidayCalendarEntry.findUnique({ where: { id } });
      data = holiday as unknown as Record<string, unknown>;
    } else if (type === 'office_memo') {
      const memo = await prisma.officeMemo.findUnique({ where: { id } });
      data = memo as unknown as Record<string, unknown>;
    } else if (type === 'leave') {
      const leave = await prisma.employeeLeaveRequest.findUnique({ where: { id } });
      data = leave as unknown as Record<string, unknown>;
    } else {
      const event = await prisma.calendarEvent.findFirst({
        where: { id, deletedAt: null },
        include: {
          employee: { select: { id: true, fullName: true, employeeNumber: true } },
          admin: { select: { id: true, name: true } },
          tags: {
            include: {
              employee: { select: { id: true, fullName: true, employeeNumber: true } },
              admin: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
      if (event) {
        if (event.adminId && !isSuperAdmin && event.adminId !== adminId) {
          const isTagged = (event.tags ?? []).some(
            (t: { adminId: string | null; participantType: string }) =>
              t.adminId === adminId && t.participantType === 'admin'
          );
          if (!isTagged) {
            return NextResponse.json({ error: 'Not authorized to view this event' }, { status: 403 });
          }
        }
        type TagRow = {
          participantType: string;
          employee: { id: string; fullName: string } | null;
          admin: { id: string; name: string; email: string } | null;
        };
        const taggedUsers = (event.tags ?? [])
          .map((t: unknown) => {
            const row = t as TagRow;
            if (row.participantType === 'employee' && row.employee) {
              return { id: row.employee.id, type: 'employee' as const, name: row.employee.fullName };
            }
            if (row.participantType === 'admin' && row.admin) {
              return { id: row.admin.id, type: 'admin' as const, name: row.admin.name, email: row.admin.email };
            }
            return null;
          })
          .filter(Boolean);

        data = {
          ...(event as unknown as Record<string, unknown>),
          taggedUsers,
          ownerType: event.employeeId ? 'employee' : 'admin',
          ownerName: event.employee?.fullName ?? event.admin?.name ?? 'Unknown',
          isOwner: event.adminId === adminId,
        };
      }
    }

    if (!data) {
      return NextResponse.json({ error: 'Calendar item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: data });
  } catch (error: unknown) {
    console.error('Error fetching calendar item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
