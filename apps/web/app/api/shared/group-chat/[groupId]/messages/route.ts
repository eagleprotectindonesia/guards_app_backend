import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getGroupMessages, getGroupMessagesSince } from '@/lib/data-access/group-chat';

function getActor(admin: Awaited<ReturnType<typeof getCurrentAdmin>>, employee: Awaited<ReturnType<typeof getAuthenticatedEmployee>>) {
  if (admin) return { participantType: 'admin' as const, adminId: admin.id };
  if (employee) return { participantType: 'employee' as const, employeeId: employee.id };
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.VIEW);

  const { searchParams } = request.nextUrl;
  const sinceParam = searchParams.get('since');
  if (sinceParam) {
    const since = new Date(sinceParam);
    if (isNaN(since.getTime())) return NextResponse.json({ error: 'Invalid since parameter' }, { status: 400 });
    const messages = await getGroupMessagesSince({ groupId, actor, since });
    return NextResponse.json(messages);
  }

  const limit = Math.min(parseInt(searchParams.get('limit') || '15', 10), 50);
  const cursorId = searchParams.get('cursor') || undefined;
  const messages = await getGroupMessages({ groupId, actor, limit, cursorId });
  return NextResponse.json(messages);
}
