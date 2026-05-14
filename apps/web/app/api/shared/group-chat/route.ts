import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { createGroupChat, getGroupChatListForParticipant } from '@/lib/data-access/group-chat';

function getActor(admin: Awaited<ReturnType<typeof getCurrentAdmin>>, employee: Awaited<ReturnType<typeof getAuthenticatedEmployee>>) {
  if (admin) return { participantType: 'admin' as const, adminId: admin.id };
  if (employee) return { participantType: 'employee' as const, employeeId: employee.id };
  return null;
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.VIEW);

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam ? new Date(cursorParam) : undefined;

  const result = await getGroupChatListForParticipant({ actor, limit, cursor });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.CREATE);

  const body = await request.json();
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description : null;
  const employeeIds = Array.isArray(body?.employeeIds) ? body.employeeIds.filter((v: unknown) => typeof v === 'string') : [];
  const adminIds = Array.isArray(body?.adminIds) ? body.adminIds.filter((v: unknown) => typeof v === 'string') : [];
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const group = await createGroupChat({ title, description, creator: actor, employeeIds, adminIds });
  return NextResponse.json(group);
}
