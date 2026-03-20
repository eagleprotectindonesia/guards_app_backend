import { NextRequest, NextResponse } from 'next/server';
import { reserveMessageDraft } from '@/lib/data-access/chat';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getCurrentAdmin, requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;

  const employee = await getAuthenticatedEmployee();
  const admin = await getCurrentAdmin();

  if (!admin && (!employee || employee.id !== employeeId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (admin) {
    await requirePermission(PERMISSIONS.CHAT.CREATE);
  }

  try {
    const draft = await reserveMessageDraft({
      employeeId,
      sender: admin ? 'admin' : 'employee',
      adminId: admin?.id,
    });

    return NextResponse.json({
      messageId: draft.id,
      expiresAt: draft.draftExpiresAt,
    });
  } catch (error) {
    console.error('Error reserving chat draft:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
