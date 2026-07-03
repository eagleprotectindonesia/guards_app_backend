import { GetObjectCommand, s3Client, BUCKET_NAME } from '@repo/storage';
import sharp from 'sharp';

export type GeofenceStatusLabel =
  | 'inside'
  | 'outside'
  | 'disabled'
  | 'unconfigured'
  | 'no-location';

export type PhotoInput = {
  s3Key: string;
  createdAt: Date;
  uploadedAt?: Date | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  geofenceStatus: GeofenceStatusLabel;
  chatContent: string | null;
  attendanceMatchedName: string | null;
};

export type FetchedPhoto = {
  buffer: Buffer;
  s3Key: string;
  createdAt: Date;
  uploadedAt: Date | null;
  contentType: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  geofenceStatus: GeofenceStatusLabel;
  chatContent: string | null;
  attendanceMatchedName: string | null;
};

export async function fetchPhotos(inputs: PhotoInput[], abortSignal?: AbortSignal): Promise<FetchedPhoto[]> {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const fetchOne = async (input: PhotoInput): Promise<FetchedPhoto | null> => {
    const { s3Key, createdAt, uploadedAt, latitude, longitude } = input;
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });

      const response = await s3Client.send(command, { abortSignal });

      if (!response.Body) {
        console.warn(`[ShiftPhotoReport] Empty body for S3 key: ${s3Key}`);
        return null;
      }

      const rawBuffer = Buffer.from(await response.Body.transformToByteArray()) as Buffer;
      let contentType = response.ContentType || 'image/jpeg';

      // pdfkit only supports JPEG, PNG, BMP — convert unsupported formats
      // and cap image dimensions to bound memory usage
      const MAX_IMAGE_WIDTH = 1280;
      const MAX_IMAGE_HEIGHT = 1800;

      let imageBuffer = rawBuffer;

      if (contentType === 'image/webp') {
        try {
          imageBuffer = (await sharp(rawBuffer)
            .resize({ width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT, fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer()) as Buffer;
          contentType = 'image/png';
        } catch (convErr) {
          console.warn(`[ShiftPhotoReport] Failed to convert WebP to PNG for ${s3Key}:`, convErr);
          return null;
        }
      } else if (contentType === 'image/png' || contentType === 'image/jpeg') {
        try {
          const metadata = await sharp(rawBuffer).metadata();
          if ((metadata.width ?? 0) > MAX_IMAGE_WIDTH || (metadata.height ?? 0) > MAX_IMAGE_HEIGHT) {
            const format = contentType === 'image/png' ? 'png' : 'jpeg';
            imageBuffer = (await sharp(rawBuffer)
              .resize({ width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_HEIGHT, fit: 'inside', withoutEnlargement: true })
              [format]()
              .toBuffer()) as Buffer;
          }
        } catch (resizeErr) {
          console.warn(`[ShiftPhotoReport] Failed to inspect/resize ${s3Key}:`, resizeErr);
        }
      }

      const resolvedUploadedAt = uploadedAt
        ?? (response.LastModified instanceof Date ? response.LastModified : null);

      return {
        buffer: imageBuffer,
        s3Key,
        createdAt,
        uploadedAt: resolvedUploadedAt,
        contentType,
        latitude,
        longitude,
        locationName: input.locationName ?? 'On Site',
        geofenceStatus: input.geofenceStatus,
        chatContent: input.chatContent,
        attendanceMatchedName: input.attendanceMatchedName,
      };
    } catch (err) {
      console.warn(`[ShiftPhotoReport] Failed to fetch S3 object ${s3Key}:`, err);
      return null;
    }
  };

  const results = await Promise.allSettled(inputs.map(fetchOne));
  return results
    .filter((r): r is PromiseFulfilledResult<FetchedPhoto> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}
