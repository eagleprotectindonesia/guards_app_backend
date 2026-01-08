import { NextRequest, NextResponse } from 'next/server';
import { getChatMessages } from '@/lib/data-access/chat';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guardId: string }> }
) {
  const { guardId } = await params;

  // Auth check: Either the guard themselves or an admin
  const guard = await getAuthenticatedGuard();
  const admin = await getCurrentAdmin();

  if (!admin && (!guard || guard.id !== guardId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const messages = await getChatMessages(guardId);
    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
