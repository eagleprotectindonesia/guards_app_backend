import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { resolveAlert } from '@/lib/data-access/alerts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const adminId = await getAdminIdFromToken();

  if (!adminId) {
    return NextResponse.json({ error: 'Unauthorized: No admin found' }, { status: 401 });
  }

  let outcome: 'resolve' | 'forgive' = 'resolve';
  let note = '';

  try {
    // Attempt to parse body if present
    const json = await req.json();
    if (json.outcome) outcome = json.outcome;
    if (json.note) note = json.note;
  } catch {
    // No body or invalid JSON, default to 'resolve'
  }

  try {
    const updatedAlert = await resolveAlert({
      id,
      adminId,
      outcome,
      note,
    });

    // Publish update
    const payload = {
      type: 'alert_updated',
      alert: updatedAlert,
    };
    await redis.publish(`alerts:site:${updatedAlert.siteId}`, JSON.stringify(payload));

    return NextResponse.json(updatedAlert);
  } catch (error: unknown) {
    console.error('Error resolving alert:', error);
    if (error instanceof Error && error.message === 'Alert not found') {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error resolving alert' }, { status: 500 });
  }
}
