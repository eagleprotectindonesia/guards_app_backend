import { NextRequest, NextResponse } from 'next/server';
import { getUnreadCount } from '@/lib/data-access/chat';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  const guard = await getAuthenticatedGuard();

  if (!admin && !guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const count = await getUnreadCount({
      guardId: guard?.id,
      isAdmin: !!admin,
    });
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
