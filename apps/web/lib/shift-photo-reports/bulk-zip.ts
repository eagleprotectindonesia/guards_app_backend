import JSZip from 'jszip';
import { buildShiftReportDownloadFilename } from '@repo/shared';

type BulkZipReport = {
  id: string;
  reportNumber: string | null;
  downloadUrl: string | null;
  employee?: { fullName: string; employeeNumber: string | null } | null;
  shift?: { site?: { name: string } | null } | null;
  shiftStartsAt?: string;
  shiftEndsAt?: string;
};

function buildFilename(report: BulkZipReport): string {
  return buildShiftReportDownloadFilename({
    siteName: report.shift?.site?.name,
    shiftStartsAt: new Date(report.shiftStartsAt ?? new Date()),
    shiftEndsAt: new Date(report.shiftEndsAt ?? new Date()),
    reportNumber: report.reportNumber,
    fallbackId: report.id,
  });
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
