import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { addGroupMembers, listGroupMembers } from '@/lib/data-access/group-chat';

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

  try {
    const participants = await listGroupMembers({ groupId, actor });
    return NextResponse.json({ participants });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list members';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const admin = await getCurrentAdmin();
  const employee = await getAuthenticatedEmployee();
  const actor = getActor(admin, employee);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (admin) await requirePermission(PERMISSIONS.CHAT.CREATE);

  const body = await request.json();
  const employeeIds = Array.isArray(body?.employeeIds) ? body.employeeIds.filter((v: unknown) => typeof v === 'string') : [];
  const adminIds = Array.isArray(body?.adminIds) ? body.adminIds.filter((v: unknown) => typeof v === 'string') : [];
  if (employeeIds.length === 0 && adminIds.length === 0) {
    return NextResponse.json({ error: 'employeeIds or adminIds is required' }, { status: 400 });
  }

  try {
    const participants = await addGroupMembers({ groupId, actor, employeeIds, adminIds });
    return NextResponse.json({ participants });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add members';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
