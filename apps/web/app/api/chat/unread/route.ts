import { NextResponse } from 'next/server';
import { getUnreadCount } from '@/lib/data-access/chat';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  const guard = await getAuthenticatedGuard();

  if (!admin && !guard) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedRole = searchParams.get('role');

  try {
    // If role is specified, prioritize that role if authenticated
    const isAdmin = requestedRole === 'admin' ? !!admin : (requestedRole === 'guard' ? false : !!admin);
    const targetGuardId = (requestedRole === 'guard' && guard) ? guard.id : (admin ? undefined : guard?.id);

    const count = await getUnreadCount({
      guardId: targetGuardId,
      isAdmin: isAdmin,
    });
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
