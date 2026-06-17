import { Job } from 'bullmq';
import { SHIFT_PHOTO_REPORT_JOB_NAME, SHIFT_PHOTO_REPORT_WAIT_MINUTES } from '@repo/database';
import {
  getOnsiteShiftPhotoReportCandidates,
  claimOnsiteShiftPhotoReport,
  getShiftReportPhotos,
  createShiftPhotoReport,
  markShiftPhotoReportGenerated,
  markShiftPhotoReportFailed,
  getShiftPhotoReportByShiftId,
  resetShiftPhotoReportClaim,
} from '@repo/database';
import { uploadFile, BUCKET_NAME } from '@repo/storage';
import { fetchPhotos } from '../lib/shift-photo-report/fetch-photos';
import { generatePdf, generateReportFileName } from '../lib/shift-photo-report/generate';

export class ShiftPhotoReportProcessor {
  async process(job: Job) {
    if (job.name === SHIFT_PHOTO_REPORT_JOB_NAME) {
      await this.processReports();
    }
  }

  private async processReports() {
    const now = new Date();
    const waitMins = SHIFT_PHOTO_REPORT_WAIT_MINUTES;

    const candidates = await getOnsiteShiftPhotoReportCandidates(now, waitMins);

    if (candidates.length === 0) {
      return;
    }

    console.log(`[ShiftPhotoReportProcessor] Found ${candidates.length} candidate(s) for auto-report.`);

    for (const shift of candidates) {
      if (!shift.employeeId) continue;

      const claimed = await claimOnsiteShiftPhotoReport(shift.id, now);
      if (!claimed) continue;

      const guardName = shift.employee?.fullName ?? 'Unknown';
      console.log(`[ShiftPhotoReportProcessor] Processing shift ${shift.id} (${guardName})`);

      try {
        const rawPhotos = await getShiftReportPhotos({
          shift: { employeeId: shift.employeeId, startsAt: shift.startsAt, endsAt: shift.endsAt },
          attendance: shift.attendance,
        });

        const photoInputs = rawPhotos.map(p => ({ s3Key: p.s3Key, createdAt: p.createdAt }));
        const fetchedPhotos = await fetchPhotos(photoInputs);

        // Create report row in pending state
        const report = await createShiftPhotoReport({
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.siteId,
          shiftStartsAt: shift.startsAt,
          shiftEndsAt: shift.endsAt,
          triggeredBy: 'auto',
          photoCount: fetchedPhotos.length,
        });

        const metadata = {
          reportNumber: report.reportNumber,
          status: 'generated',
          guardName,
          employeeNumber: shift.employee?.employeeNumber ?? '-',
          clientName: shift.site.clientName ?? null,
          siteName: shift.site.name,
          shiftStartsAt: shift.startsAt,
          shiftEndsAt: shift.endsAt,
          photoCount: fetchedPhotos.length,
        };

        const pdfBuffer = await generatePdf(metadata, fetchedPhotos);
        const fileName = generateReportFileName(guardName, shift.employee?.employeeNumber ?? '0000', shift.startsAt);

        const uploadResult = await uploadFile(pdfBuffer, fileName, 'application/pdf', {
          folder: 'shift-reports',
          siteId: shift.siteId,
          shiftId: shift.id,
          reportId: report.id,
        });

        if (!BUCKET_NAME) {
          throw new Error('AWS_S3_BUCKET_NAME is not configured');
        }

        await markShiftPhotoReportGenerated({
          id: report.id,
          pdfS3Key: uploadResult.key,
          pdfS3Bucket: BUCKET_NAME,
          pdfSizeBytes: pdfBuffer.length,
          photoCount: fetchedPhotos.length,
        });

        console.log(`[ShiftPhotoReportProcessor] Report generated for shift ${shift.id}: ${uploadResult.key}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[ShiftPhotoReportProcessor] Failed for shift ${shift.id}:`, errorMessage);

        try {
          const existing = await getShiftPhotoReportByShiftId(shift.id);
          if (existing && existing.status === 'pending') {
            await markShiftPhotoReportFailed({ id: existing.id, errorMessage });
          } else {
            await resetShiftPhotoReportClaim(shift.id);
          }
        } catch {
          await resetShiftPhotoReportClaim(shift.id);
        }
      }
    }
  }
}
