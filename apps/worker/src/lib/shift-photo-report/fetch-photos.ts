import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '@repo/storage';

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

      const buffer = await response.Body.transformToByteArray();
      const contentType = response.ContentType || 'image/jpeg';

      results.push({
        buffer: Buffer.from(buffer),
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
