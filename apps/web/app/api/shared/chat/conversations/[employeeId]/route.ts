import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getConversationLaunchInfo, setConversationArchiveState } from '@/lib/data-access/chat';

export async function GET(_: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requirePermission(PERMISSIONS.CHAT.VIEW);

  try {
    const { employeeId } = await params;
    const info = await getConversationLaunchInfo({ adminId: admin.id, employeeId });
    if (!info) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    return NextResponse.json(info);
  } catch (error) {
    console.error('Error fetching conversation launch info:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requirePermission(PERMISSIONS.CHAT.VIEW);

  try {
    const { employeeId } = await params;
    const body = await request.json();

    if (typeof body?.isArchived !== 'boolean') {
      return NextResponse.json({ error: 'isArchived must be a boolean' }, { status: 400 });
    }

    const state = await setConversationArchiveState({
      adminId: admin.id,
      employeeId,
      isArchived: body.isArchived,
    });

    return NextResponse.json({
      employeeId: state.employeeId,
      isArchived: state.isArchived,
      isMuted: state.isMuted,
      archivedAt: state.archivedAt,
      mutedAt: state.mutedAt,
    });
  } catch (error) {
    console.error('Error updating conversation archive state:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
