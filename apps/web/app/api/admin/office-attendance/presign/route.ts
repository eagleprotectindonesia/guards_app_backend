import { NextRequest, NextResponse } from 'next/server';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessOfficeAttendance } from '@/lib/auth/admin-visibility';

export async function POST(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!adminHasPermission(session, PERMISSIONS.ATTENDANCE.VIEW) || !canAccessOfficeAttendance(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { key?: unknown };
  try {
    body = (await request.json()) as { key?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key : null;
  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  }

  if (key.startsWith('http://') || key.startsWith('https://')) {
    return NextResponse.json({ url: key });
  }

  try {
    const url = await getCachedPresignedDownloadUrl(key);
    return NextResponse.json({ url });
  } catch (error) {
    console.warn('Failed to generate presigned URL for office attendance photo:', error);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }
}
