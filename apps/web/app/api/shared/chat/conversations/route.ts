import { NextResponse } from 'next/server';
import { getConversationListPaginated } from '@/lib/data-access/chat';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
