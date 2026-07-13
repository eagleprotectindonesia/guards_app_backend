import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { listRecentAdminNotifications, getOpenAlertsForDashboard } from '@repo/database';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [notifications, alerts] = await Promise.all([
    listRecentAdminNotifications(session.id, 100),
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
