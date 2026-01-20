import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { redis } from './redis';

const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_S3_BUCKET_NAME;

if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
  console.warn('AWS S3 environment variables are not fully configured.');
}

export const s3Client = new S3Client({
  region: region || 'us-east-1',
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
});

export const BUCKET_NAME = bucketName;

/**
 * Generates a presigned URL for uploading a file to S3.
 */
export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
  folder: string = 'uploads'
) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const key = `${folder}/${Date.now()}-${fileName.replace(/\s+/g, '-')}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  // This is the static URL, which will only work if the bucket is public.
  const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl, key };
}

/**
 * Generates a presigned URL for downloading/viewing a file from S3.
 * Max expiration is 7 days (604800 seconds).
 */
export async function getPresignedDownloadUrl(key: string, expiresIn: number = 604800) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Gets a presigned URL for downloading, with Redis caching.
 * Defaults to 7 days expiration.
 */
export async function getCachedPresignedDownloadUrl(key: string, expiresIn: number = 604800) {
  const cacheKey = `s3:presigned:${key}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch (error) {
    console.warn('Redis error fetching cached S3 URL:', error);
  }

  const url = await getPresignedDownloadUrl(key, expiresIn);

  try {
    // Cache for 1 hour less than expiry to ensure it doesn't expire while in cache
    const cacheExpiry = Math.max(expiresIn - 3600, 3600);
    await redis.set(cacheKey, url, 'EX', cacheExpiry);
  } catch (error) {
    console.warn('Redis error saving cached S3 URL:', error);
  }

  return url;
}

export async function uploadFile(
  file: Buffer | Uint8Array,
  fileName: string,
  contentType: string,
  folder: string = 'uploads'
) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const key = `${folder}/${Date.now()}-${fileName.replace(/\s+/g, '-')}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return {
    url: `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`,
    key,
  };
}
