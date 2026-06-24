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
        console.log(`[ShiftPhotoReportProcessor]   Fetching ${photoInputs.length} photo(s) for shift ${shift.id}...`);
        const fetchedPhotos = await fetchPhotos(photoInputs, AbortSignal.timeout(90_000));
        console.log(`[ShiftPhotoReportProcessor]   Fetched ${fetchedPhotos.length} photo(s) for shift ${shift.id}`);

        // Create report row in pending state
        console.log(`[ShiftPhotoReportProcessor]   Creating report for shift ${shift.id}...`);
        const report = await createShiftPhotoReport({
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.siteId,
          shiftStartsAt: shift.startsAt,
          shiftEndsAt: shift.endsAt,
          triggeredBy: 'auto',
          photoCount: fetchedPhotos.length,
        });
        console.log(`[ShiftPhotoReportProcessor]   Report created for shift ${shift.id}: ${report.reportNumber}`);

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

        console.log(`[ShiftPhotoReportProcessor]   Generating PDF for shift ${shift.id}...`);
        const pdfBuffer = await generatePdf(metadata, fetchedPhotos, AbortSignal.timeout(120_000));
        console.log(`[ShiftPhotoReportProcessor]   PDF generated for shift ${shift.id}: ${pdfBuffer.length} bytes`);

        const fileName = generateReportFileName(guardName, shift.employee?.employeeNumber ?? '0000', shift.startsAt);

        console.log(`[ShiftPhotoReportProcessor]   Uploading PDF for shift ${shift.id}...`);
        const uploadResult = await uploadFile(pdfBuffer, fileName, 'application/pdf', {
          folder: 'shift-reports',
          siteId: shift.siteId,
          shiftId: shift.id,
          reportId: report.id,
        }, AbortSignal.timeout(120_000));

        if (!BUCKET_NAME) {
          throw new Error('AWS_S3_BUCKET_NAME is not configured');
        }

        console.log(`[ShiftPhotoReportProcessor]   Uploaded PDF for shift ${shift.id}: ${uploadResult.key}`);
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
