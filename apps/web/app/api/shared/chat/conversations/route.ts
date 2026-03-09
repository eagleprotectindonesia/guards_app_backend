import { NextResponse } from 'next/server';
import { getConversationList } from '@/lib/data-access/chat';
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

    const conversations = await getConversationList(admin.id, normalizedView);
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Error fetching conversation list:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
