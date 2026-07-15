import { getShiftPhotoReportById as getByIdDb, getShiftPhotoReportsByIds as getByIdsDb } from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';
import { buildShiftReportDownloadFilename } from '@repo/shared';

export async function getReportById(id: string) {
  const report = await getByIdDb(id);
  if (!report) return null;

  let downloadUrl: string | null = null;
  let downloadFileName: string | null = null;
  if (report.pdfS3Key) {
    downloadFileName = buildShiftReportDownloadFilename({
      siteName: (report.shift as { site?: { name?: string } } | null)?.site?.name,
      shiftStartsAt: new Date(report.shiftStartsAt),
      shiftEndsAt: new Date(report.shiftEndsAt),
      reportNumber: report.reportNumber,
      fallbackId: report.id,
    });
    downloadUrl = await getCachedPresignedDownloadUrl(
      report.pdfS3Key,
      604800,
      { fileName: downloadFileName, contentType: 'application/pdf' },
    );
  }

  return { ...report, downloadUrl, downloadFileName };
}

export async function getReportsByIds(ids: string[]) {
  return getByIdsDb(ids);
}
