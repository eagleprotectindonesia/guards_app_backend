import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { setGroupChatArchiveState } from '@/lib/data-access/group-chat';

function getActor(admin: Awaited<ReturnType<typeof getCurrentAdmin>>, employee: Awaited<ReturnType<typeof getAuthenticatedEmployee>>) {
  if (admin) return { participantType: 'admin' as const, adminId: admin.id };
  if (employee) return { participantType: 'employee' as const, employeeId: employee.id };
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.CREATE);

  const body = await request.json();
  if (typeof body?.isArchived !== 'boolean') {
    return NextResponse.json({ error: 'isArchived must be a boolean' }, { status: 400 });
  }

  try {
    const state = await setGroupChatArchiveState({ groupId, actor, isArchived: body.isArchived });
    return NextResponse.json({
      groupId,
      participantId: state.id,
      isArchived: state.isArchived,
      isMuted: state.isMuted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update group state';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
