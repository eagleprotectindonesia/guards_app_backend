import { Job } from 'bullmq';
import {
  SHIFT_PHOTO_REPORT_JOB_NAME,
  SHIFT_PHOTO_REPORT_WAIT_MINUTES,
  getOnsiteShiftPhotoReportCandidates,
  claimOnsiteShiftPhotoReport,
  getShiftReportPhotos,
  getShiftLocationPoints,
  getActiveSitePosts,
  getSystemSetting,
  createShiftPhotoReport,
  markShiftPhotoReportGenerated,
  markShiftPhotoReportFailed,
  getShiftPhotoReportByShiftId,
  resetShiftPhotoReportClaim,
  prisma,
} from '@repo/database';
import { uploadFile, BUCKET_NAME } from '@repo/storage';
import { fetchPhotos, type PhotoInput } from '../lib/shift-photo-report/fetch-photos';
import {
  generatePdf,
  generateReportFileName,
  buildReportMetadata,
} from '../lib/shift-photo-report/generate';
import {
  resolveFirstAndLastLocation,
  summarizeSiteBoundary,
  resolveLocationName,
  computeGeofenceStatus,
  buildLocationTrail,
  bboxCenter,
  bboxToZoomLevel,
  computeTrailBoundingBox,
  type GeofenceContext,
} from '../lib/shift-photo-report/aggregate';
import { fetchTrailMapPng, type SitePostLike } from '../lib/shift-photo-report/static-map';

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

      const trace = (step: string, extra?: Record<string, unknown>) => {
        console.log(`[ShiftPhotoReportTrace] shift=${shift.id} step=${step}${extra ? ' ' + JSON.stringify(extra) : ''}`);
      };
      const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        trace(`start:${step}`);
        try {
          const result = await fn();
          trace(`ok:${step}`, { durationMs: Date.now() - t0 });
          return result;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorName = err instanceof Error ? err.name : 'Error';
          trace(`fail:${step}`, { durationMs: Date.now() - t0, errorName, errorMessage });
          throw err;
        }
      };

      const employeeId = shift.employeeId;
      const shiftId = shift.id;
      const siteId = shift.siteId;
      const startsAt = shift.startsAt;
      const endsAt = shift.endsAt;
      const employee = shift.employee;
      const site = shift.site;
      const attendance = shift.attendance;

      const groupChatId = shift.groupShiftId
        ? ((await prisma.groupChat.findUnique({
            where: { groupShiftId: shift.groupShiftId },
            select: { id: true },
          }))?.id ?? null)
        : null;

      try {

        const [rawPhotos, sitePosts, maxDistanceSetting] = await Promise.all([
          timed('db:photos', () => getShiftReportPhotos({
            shift: { employeeId, startsAt, endsAt },
            attendance: attendance ?? undefined,
            groupChatId,
          })),
          timed('db:site-posts', () => getActiveSitePosts(siteId)),
          timed('db:system-setting(MAX_CHECKIN_DISTANCE_METERS)', () => getSystemSetting('MAX_CHECKIN_DISTANCE_METERS')),
        ]);

        const maxDistanceMeters = parseInt(maxDistanceSetting?.value ?? process.env.MAX_CHECKIN_DISTANCE_METERS ?? '0', 10);
        const resolvedMaxDistance = Number.isFinite(maxDistanceMeters) && maxDistanceMeters > 0 ? maxDistanceMeters : 0;
        const geofenceContext: GeofenceContext = {
          latitude: site.latitude ?? null,
          longitude: site.longitude ?? null,
          sitePosts,
          maxDistanceMeters: resolvedMaxDistance,
          geofenceStatusEnabled: site.geofenceStatus !== false,
        };

        const photoInputs: PhotoInput[] = rawPhotos.map(p => {
          const hasPoint = p.latitude != null && p.longitude != null;
          const point = hasPoint ? { latitude: p.latitude as number, longitude: p.longitude as number } : null;
          const locationName = resolveLocationName(point, p.attendanceMatchedName, sitePosts, site.name);
          const geofenceStatus = computeGeofenceStatus(point, geofenceContext);
          return {
            s3Key: p.s3Key,
            createdAt: p.createdAt,
            latitude: p.latitude,
            longitude: p.longitude,
            locationName,
            geofenceStatus,
            chatContent: p.content,
            attendanceMatchedName: p.attendanceMatchedName,
          };
        });

        const fetchedPhotos = await timed(`s3:download-photos(count=${photoInputs.length})`, () => fetchPhotos(photoInputs, AbortSignal.timeout(90_000)));

        const report = await timed('db:create-report', () => createShiftPhotoReport({
          shiftId,
          employeeId,
          clientId: siteId,
          shiftStartsAt: startsAt,
          shiftEndsAt: endsAt,
          triggeredBy: 'auto',
          photoCount: fetchedPhotos.length,
        }));

        const fileName = generateReportFileName({
          siteName: site.name,
          shiftStartsAt: startsAt,
          shiftEndsAt: endsAt,
          reportNumber: report.reportNumber,
          fallbackId: report.id,
        });

        const locationSources = await timed('db:location-points', () => getShiftLocationPoints({
          shiftId,
          employeeId,
          startsAt,
          endsAt,
          groupChatId,
        }));
        const { first: firstLocation, last: lastLocation } = resolveFirstAndLastLocation(locationSources, sitePosts, endsAt);
        const geofencePoints = [
          ...(locationSources.attendancePoint ? [locationSources.attendancePoint] : []),
          ...locationSources.checkinPoints,
          ...locationSources.chatPoints,
        ];
        const geofenceSummary = summarizeSiteBoundary(geofencePoints, geofenceContext);

        const trail = buildLocationTrail(locationSources, sitePosts, {
          siteName: site.name,
          siteCenter: site.latitude != null && site.longitude != null
            ? { latitude: site.latitude, longitude: site.longitude }
            : null,
        });

        // Google Maps Static API hard-limit: 640px per axis (free tier).
        const TRAIL_MAP_WIDTH = 640;
        const TRAIL_MAP_HEIGHT = 480;
        let trailMapBuffer: Buffer | null = null;
        if (trail.length > 0) {
          const trailPoints = trail.map(p => ({
            seq: p.seq,
            latitude: p.latitude,
            longitude: p.longitude,
          }));
          const sitePostsForMap: SitePostLike[] = sitePosts.map(p => ({
            name: p.name,
            latitude: p.latitude,
            longitude: p.longitude,
          }));
          const sitePostsForBbox = sitePostsForMap.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
          const trailPointsForBbox = trailPoints.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
          const bbox = computeTrailBoundingBox({
            trailPoints: trailPointsForBbox,
            sitePosts: sitePostsForBbox,
          });
          const center = bbox ? bboxCenter(bbox) : null;
          const zoom = bbox ? bboxToZoomLevel(bbox, TRAIL_MAP_WIDTH, TRAIL_MAP_HEIGHT) : null;
          trailMapBuffer = await timed('maps:trail-png', () => fetchTrailMapPng({
            trailPoints,
            sitePosts: sitePostsForMap,
            siteCenter: site.latitude != null && site.longitude != null
              ? { latitude: site.latitude, longitude: site.longitude }
              : null,
            siteRadius: site.geofenceRadius ?? null,
            center,
            zoom,
            width: TRAIL_MAP_WIDTH,
            height: TRAIL_MAP_HEIGHT,
            signal: AbortSignal.timeout(15_000),
          }));
        }

        const metadata = buildReportMetadata({
          reportNumber: report.reportNumber,
          status: 'generated',
          guardName,
          employeeNumber: employee?.employeeNumber ?? '-',
          clientName: site.clientName ?? null,
          siteName: site.name,
          shiftTypeName: shift.shiftType?.name ?? '-',
          shiftStartsAt: startsAt,
          shiftEndsAt: endsAt,
          photoCount: fetchedPhotos.length,
          locationUpdateCount: locationSources.checkinPoints.length + locationSources.chatPoints.length,
          firstLocation,
          lastLocation,
          geofenceSummary,
        });

        const pdfBuffer = await timed('pdf:generate(bytes)', () => generatePdf(metadata, fetchedPhotos, {
          trail,
          trailMapBuffer,
          signal: AbortSignal.timeout(120_000),
        }).then(b => (trace('pdf:size', { bytes: b.length }), b)));

        if (!BUCKET_NAME) {
          throw new Error('AWS_S3_BUCKET_NAME is not configured');
        }

        const uploadResult = await timed(`s3:upload-pdf(key=${fileName}, bytes=${pdfBuffer.length})`, () => uploadFile(pdfBuffer, fileName, 'application/pdf', {
          folder: 'shift-reports',
          siteId,
          shiftId,
          reportId: report.id,
        }, AbortSignal.timeout(120_000)));

        await timed('db:mark-generated', () => markShiftPhotoReportGenerated({
          id: report.id,
          pdfS3Key: uploadResult.key,
          pdfS3Bucket: BUCKET_NAME!,
          pdfSizeBytes: pdfBuffer.length,
          photoCount: fetchedPhotos.length,
        }));

        console.log(`[ShiftPhotoReportProcessor] Report generated for shift ${shiftId}: ${uploadResult.key}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        console.error(`[ShiftPhotoReportProcessor] Failed for shift ${shiftId}:`, errorMessage);
        if (errorStack) {
          console.error(`[ShiftPhotoReportProcessor] Stack for shift ${shiftId}:`, errorStack);
        }

        try {
          const existing = await getShiftPhotoReportByShiftId(shiftId);
          if (existing && existing.status === 'pending') {
            await markShiftPhotoReportFailed({ id: existing.id, errorMessage });
          } else {
            await resetShiftPhotoReportClaim(shiftId);
          }
        } catch {
          await resetShiftPhotoReportClaim(shiftId);
        }
      }
    }
  }
}
