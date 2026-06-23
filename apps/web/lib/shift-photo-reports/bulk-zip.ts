import JSZip from 'jszip';

type BulkZipReport = {
  id: string;
  reportNumber: string | null;
  downloadUrl: string | null;
  employee?: { fullName: string; employeeNumber: string | null } | null;
  shift?: { site?: { name: string } | null } | null;
  shiftStartsAt?: string;
};

function buildFilename(report: BulkZipReport): string {
  const parts: string[] = [];
  const safe = (s: string) =>
    s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unnamed';

  if (report.employee?.fullName) {
    parts.push(safe(report.employee.fullName));
    if (report.employee.employeeNumber) parts.push(safe(report.employee.employeeNumber));
  }
  if (report.shift?.site?.name) parts.push(safe(report.shift.site.name));
  if (report.shiftStartsAt) parts.push(report.shiftStartsAt.slice(0, 10));

  if (parts.length > 0) return `shift_report_${parts.join('_')}.pdf`;
  return `shift_report_${report.reportNumber ?? report.id}.pdf`;
}

export async function buildShiftReportsZip(reports: BulkZipReport[]): Promise<Blob> {
  const downloadable = reports.filter(r => r.downloadUrl);
  if (downloadable.length === 0) {
    throw new Error('No downloadable reports selected');
  }

  const zip = new JSZip();

  await Promise.all(
    downloadable.map(async report => {
      const response = await fetch(report.downloadUrl!);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${report.reportNumber ?? report.id}: ${response.status}`);
      }
      const blob = await response.blob();
      zip.file(buildFilename(report), blob);
    })
  );

  return zip.generateAsync({ type: 'blob' });
}
