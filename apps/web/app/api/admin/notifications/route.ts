import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { listRecentAdminNotifications, getOpenAlertsForDashboard } from '@repo/database';

const RANGE_MS: Record<string, number> = {
  '1d': 86400000,
  '7d': 604800000,
  '30d': 2592000000,
};

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') ?? '30d';
  const since = range === 'all' ? undefined : new Date(Date.now() - (RANGE_MS[range] ?? RANGE_MS['30d']));

  const [notifications, alerts] = await Promise.all([
    listRecentAdminNotifications(session.id, 100, since),
    getOpenAlertsForDashboard(),
  ]);

  return NextResponse.json({
    notifications: notifications.map(n => ({
      ...n,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    alerts,
  });
}
