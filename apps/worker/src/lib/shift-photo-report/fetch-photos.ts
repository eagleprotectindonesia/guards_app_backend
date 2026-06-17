import { GetObjectCommand, s3Client, BUCKET_NAME } from '@repo/storage';
import sharp from 'sharp';

export type PhotoInput = {
  s3Key: string;
  createdAt: Date;
};

export type FetchedPhoto = {
  buffer: Buffer;
  s3Key: string;
  createdAt: Date;
  contentType: string;
};

export async function fetchPhotos(inputs: PhotoInput[]): Promise<FetchedPhoto[]> {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const results: FetchedPhoto[] = [];

  for (const { s3Key, createdAt } of inputs) {
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        console.warn(`[ShiftPhotoReport] Empty body for S3 key: ${s3Key}`);
        continue;
      }

      const rawBuffer = Buffer.from(await response.Body.transformToByteArray()) as Buffer;
      let contentType = response.ContentType || 'image/jpeg';

      // pdfkit only supports JPEG, PNG, BMP — convert WebP to PNG
      let imageBuffer = rawBuffer;
      if (contentType === 'image/webp') {
        try {
          imageBuffer = (await sharp(rawBuffer).png().toBuffer()) as Buffer;
          contentType = 'image/png';
        } catch (convErr) {
          console.warn(`[ShiftPhotoReport] Failed to convert WebP to PNG for ${s3Key}:`, convErr);
        }
      }

      results.push({
        buffer: imageBuffer,
        s3Key,
        createdAt,
        contentType,
      });
    } catch (err) {
      console.warn(`[ShiftPhotoReport] Failed to fetch S3 object ${s3Key}:`, err);
    }
  }

  return results;
}
