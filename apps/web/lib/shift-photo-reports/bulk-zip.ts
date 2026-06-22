import JSZip from 'jszip';

type BulkZipReport = {
  id: string;
  reportNumber: string | null;
  downloadUrl: string | null;
};

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
      const filename = report.reportNumber ? `${report.reportNumber}.pdf` : `${report.id}.pdf`;
      zip.file(filename, blob);
    })
  );

  return zip.generateAsync({ type: 'blob' });
}
