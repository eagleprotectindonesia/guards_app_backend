import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { adminHasPermission } from '@/lib/admin-auth';
import { logShiftPhotoReportDownload } from '@repo/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminAuthSession();
  if (!session || !adminHasPermission(session, PERMISSIONS.CHANGELOGS.VIEW)) {
    return NextResponse.json({ ok: true });
  }

  const { id } = await params;

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const mode = body.mode === 'bulk' ? 'bulk' : 'single';

  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  try {
    await logShiftPhotoReportDownload({
      reportId: id,
      adminId: session.id,
      mode,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('[DownloadLog] Failed to record download:', error);
  }

  return NextResponse.json({ ok: true });
}
