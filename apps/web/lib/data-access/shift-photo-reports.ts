import { getShiftPhotoReportById as getByIdDb } from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

export async function getReportById(id: string) {
  const report = await getByIdDb(id);
  if (!report) return null;

  let downloadUrl: string | null = null;
  if (report.pdfS3Key) {
    downloadUrl = await getCachedPresignedDownloadUrl(report.pdfS3Key);
  }

  return { ...report, downloadUrl };
}
