import { NextResponse } from 'next/server';
import { getTicketSidebarCounts } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.TICKETS.VIEW);
    const counts = await getTicketSidebarCounts(session.id);
    return NextResponse.json(counts);
  } catch (error) {
    console.error('Failed to fetch ticket counters', error);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
