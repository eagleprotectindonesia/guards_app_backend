import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/admin-auth';
import { setConversationArchiveState } from '@/lib/data-access/chat';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
