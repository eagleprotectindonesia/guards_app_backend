import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { disbandGroup, getGroupChatForParticipant, updateGroupChat } from '@/lib/data-access/group-chat';

function getActor(admin: Awaited<ReturnType<typeof getCurrentAdmin>>, employee: Awaited<ReturnType<typeof getAuthenticatedEmployee>>) {
  if (admin) return { participantType: 'admin' as const, adminId: admin.id };
  if (employee) return { participantType: 'employee' as const, employeeId: employee.id };
  return null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.VIEW);

  const group = await getGroupChatForParticipant({ groupId, actor });
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(group);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.CREATE);

  const body = await request.json();
  const title = typeof body?.title === 'string' ? body.title.trim() : undefined;
  const description = typeof body?.description === 'string' || body?.description === null ? body.description : undefined;
  if (title !== undefined && !title) return NextResponse.json({ error: 'title must be non-empty' }, { status: 400 });

  const group = await updateGroupChat({ groupId, actor, title, description });
  return NextResponse.json(group);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.CREATE);

  try {
    const result = await disbandGroup({ groupId, actor });
    return NextResponse.json({
      success: true,
      groupId: result.id,
      archivedAt: result.archivedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disband group';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
