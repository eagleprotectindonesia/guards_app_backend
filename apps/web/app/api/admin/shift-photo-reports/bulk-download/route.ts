import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getAdminAuthSession, adminHasPermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getReportsByIds } from '@/lib/data-access/shift-photo-reports';
import { getS3ObjectBuffer } from '@repo/storage';
import { buildShiftReportDownloadFilename } from '@repo/shared';
import { logShiftPhotoReportDownload } from '@repo/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BULK_SIZE = 50;

export async function POST(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session || !adminHasPermission(session, PERMISSIONS.CHANGELOGS.VIEW)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Accept both JSON and form-encoded input (form submit from the client).
  let ids: string[] = [];
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    ids = Array.isArray(body.reportIds) ? body.reportIds.filter((s: unknown) => typeof s === 'string') : [];
  } else {
    const fd = await request.formData();
    const raw = fd.get('reportIds');
    ids = typeof raw === 'string' ? raw.split(',').filter(Boolean) : [];
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: 'reportIds is required' }, { status: 400 });
  }
  if (ids.length > MAX_BULK_SIZE) {
    return NextResponse.json({ error: `Maximum ${MAX_BULK_SIZE} reports per bulk download` }, { status: 400 });
  }

  // Fetch report metadata in one query.
  const reports = await getReportsByIds(ids);
  const byId = new Map(reports.map(r => [r.id, r]));

  // Validate every requested id — atomic, no partial download.
  const missing: string[] = [];
  const notDownloadable: string[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) { missing.push(id); continue; }
    if (r.status !== 'generated' || !r.pdfS3Key) notDownloadable.push(id);
  }
  if (missing.length > 0 || notDownloadable.length > 0) {
    return NextResponse.json(
      { error: 'Some reports are missing or not downloadable', missing, notDownloadable },
      { status: 400 },
    );
  }

  // Build the zip in memory.
  const zip = new JSZip();
  for (const r of reports) {
    const { buffer } = await getS3ObjectBuffer(r.pdfS3Key!);
    const fileName = buildShiftReportDownloadFilename({
      siteName: r.shift?.site?.name,
      shiftStartsAt: new Date(r.shiftStartsAt),
      shiftEndsAt: new Date(r.shiftEndsAt),
      reportNumber: r.reportNumber,
      fallbackId: r.id,
    });
    zip.file(fileName, buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

  // Log downloads fire-and-forget after successful zip build.
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  Promise.allSettled(
    reports.map(r =>
      logShiftPhotoReportDownload({
        reportId: r.id,
        adminId: session.id,
        mode: 'bulk',
        ipAddress,
        userAgent,
      }),
    ),
  ).catch(err => console.error('[BulkDownload] Failed to record downloads:', err));

  const zipFileName = `shift-photo-reports-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(Buffer.from(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(zipBuffer.byteLength),
      'Content-Disposition': `attachment; filename="${zipFileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
