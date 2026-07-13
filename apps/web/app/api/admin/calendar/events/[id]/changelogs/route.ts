import { NextResponse } from 'next/server';
import { listCalendarEventChangelogs } from '@repo/database';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { prisma } from '@repo/database';

type ChangelogRow = {
  id: string;
  action: string;
  createdAt: Date;
  actor: string;
  actorId: string | null;
  employeeId: string | null;
  admin: { name: string } | null;
  employee: { fullName: string } | null;
  details: unknown;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminAuthSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(_req.url);
  const limitParam = searchParams.get('limit');
  const cursor = searchParams.get('cursor');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;

  const event = await prisma.calendarEvent.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, adminId: true, employeeId: true },
  });

  if (!event) {
    return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 });
  }

  const { items, nextCursor } = await listCalendarEventChangelogs(id, { limit, cursor: cursor ?? undefined });

  const changelogs = items.map((item: ChangelogRow) => {
    let actor: { type: string; id: string | null; name: string | null };
    if (item.actor === 'admin') {
      actor = { type: 'admin', id: item.actorId ?? null, name: item.admin?.name ?? null };
    } else if (item.actor === 'employee') {
      actor = { type: 'employee', id: item.employeeId ?? null, name: item.employee?.fullName ?? null };
    } else {
      actor = { type: 'system', id: null, name: null };
    }
    return {
      id: item.id,
      action: item.action,
      createdAt: item.createdAt.toISOString(),
      actor,
      details: item.details,
    };
  });

  return NextResponse.json({ items: changelogs, nextCursor });
}
