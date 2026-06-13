import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { serialize, getPaginationParams } from '@/lib/server-utils';
import {
  listShiftPhotoReportsPaginated,
  createRegeneratedShiftPhotoReport,
} from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@repo/storage';
import { revalidatePath } from 'next/cache';
import { ShiftPhotoReportStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = Object.values(ShiftPhotoReportStatus) as string[];

async function regenerateAction(formData: FormData) {
  'use server';

  const { requirePermission: auth } = await import('@/lib/admin-auth');
  const session = await auth(PERMISSIONS.SHIFTS.EDIT);

  const reportId = formData.get('id')?.toString();
  if (!reportId) throw new Error('Missing report id');

  await createRegeneratedShiftPhotoReport({ originalReportId: reportId, adminId: session.id });
  revalidatePath('/admin/shift-photo-reports');
}

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ShiftPhotoReportsPage(props: PageProps) {
  await requirePermission(PERMISSIONS.SHIFTS.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage } = getPaginationParams(searchParams, 20);

  const dateFrom = searchParams.dateFrom as string | undefined;
  const dateTo = searchParams.dateTo as string | undefined;
  const employeeId = searchParams.employeeId as string | undefined;
  const clientId = searchParams.clientId as string | undefined;
  const statusParam = searchParams.status as string | undefined;
  const status = statusParam && VALID_STATUSES.includes(statusParam) ? (statusParam as ShiftPhotoReportStatus) : undefined;

  const { reports, totalCount } = await listShiftPhotoReportsPaginated({
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    employeeId,
    clientId,
    status,
    page,
    pageSize: perPage,
  });

  const totalPages = Math.ceil(totalCount / perPage);

  const enriched = await Promise.all(
    reports.map(async report => ({
      ...report,
      downloadUrl: report.pdfS3Key ? await getCachedPresignedDownloadUrl(report.pdfS3Key) : null,
    }))
  );

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (employeeId) params.set('employeeId', employeeId);
    if (clientId) params.set('clientId', clientId);
    if (statusParam) params.set('status', statusParam);
    Object.entries(overrides).forEach(([k, v]) => params.set(k, v));
    return `?${params.toString()}`;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Shift Photo Reports</h1>

      {/* Filters */}
      <form className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium">Date From</label>
          <input name="dateFrom" type="date" defaultValue={dateFrom ?? ''} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Date To</label>
          <input name="dateTo" type="date" defaultValue={dateTo ?? ''} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Employee ID</label>
          <input name="employeeId" defaultValue={employeeId ?? ''} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Client</label>
          <input name="clientId" defaultValue={clientId ?? ''} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select name="status" defaultValue={statusParam ?? ''} className="border rounded px-2 py-1">
            <option value="">All</option>
            {VALID_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700">Filter</button>
      </form>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2 border">Guard</th>
              <th className="text-left p-2 border">Client</th>
              <th className="text-left p-2 border">Shift</th>
              <th className="text-left p-2 border">Photos</th>
              <th className="text-left p-2 border">Status</th>
              <th className="text-left p-2 border">Created</th>
              <th className="text-left p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(report => (
              <tr key={report.id} className="border-b hover:bg-gray-50">
                <td className="p-2 border">{report.employee?.fullName ?? '—'}</td>
                <td className="p-2 border">{report.clientId ?? '—'}</td>
                <td className="p-2 border text-xs">
                  {new Date(report.shiftStartsAt).toLocaleString('en-ID', { timeZone: 'Asia/Makassar' })}<br />
                  {new Date(report.shiftEndsAt).toLocaleString('en-ID', { timeZone: 'Asia/Makassar' })}
                </td>
                <td className="p-2 border text-center">{report.photoCount}</td>
                <td className="p-2 border">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    report.status === 'generated' ? 'bg-green-100 text-green-800' :
                    report.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    report.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {report.status}
                  </span>
                </td>
                <td className="p-2 border text-xs">
                  {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-ID', { timeZone: 'Asia/Makassar' }) : '—'}
                </td>
                <td className="p-2 border">
                  <div className="flex gap-2">
                    {report.downloadUrl ? (
                      <a href={report.downloadUrl} download className="text-blue-600 hover:underline text-xs">
                        Download
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">No PDF</span>
                    )}
                    <form action={regenerateAction}>
                      <input type="hidden" name="id" value={report.id} />
                      <button type="submit" className="text-orange-600 hover:underline text-xs">
                        Regenerate
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {page > 1 && (
            <a href={qs({ page: String(page - 1) })} className="px-3 py-1 border rounded hover:bg-gray-100">Previous</a>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a
              key={p}
              href={qs({ page: String(p) })}
              className={`px-3 py-1 border rounded ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
            >
              {p}
            </a>
          ))}
          {page < totalPages && (
            <a href={qs({ page: String(page + 1) })} className="px-3 py-1 border rounded hover:bg-gray-100">Next</a>
          )}
        </div>
      )}

      <p className="text-sm text-gray-500 mt-4">{totalCount} report(s)</p>
    </div>
  );
}
