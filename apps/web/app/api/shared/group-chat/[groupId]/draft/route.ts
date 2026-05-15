import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { reserveGroupMessageDraft } from '@/lib/data-access/group-chat';

function getActor(admin: Awaited<ReturnType<typeof getCurrentAdmin>>, employee: Awaited<ReturnType<typeof getAuthenticatedEmployee>>) {
  if (admin) return { participantType: 'admin' as const, adminId: admin.id };
  if (employee) return { participantType: 'employee' as const, employeeId: employee.id };
  return null;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.CREATE);

  const draft = await reserveGroupMessageDraft({ groupId, actor });
  return NextResponse.json({ messageId: draft.id, expiresAt: draft.draftExpiresAt });
}
