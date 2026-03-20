import { NextResponse } from 'next/server';
import { getConversationListPaginated } from '@/lib/data-access/chat';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function GET(request: Request) {
  const admin = await requirePermission(PERMISSIONS.CHAT.VIEW);

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');
    const normalizedView = view === 'archived' || view === 'unread' ? view : 'inbox';
    const cursor = searchParams.get('cursor') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50);

    const result = await getConversationListPaginated({
      adminId: admin.id,
      view: normalizedView,
      limit,
      cursor,
      search,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching conversation list:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
