import { S3Client, PutObjectCommand, GetObjectCommand, type GetObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import crypto from 'crypto';
import { redis } from '@repo/database/redis';

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

type UploadFolderOptions = {
  folder?: string;
  conversationId?: string;
  messageId?: string;
  fileType?: string;
  ticketId?: string;
};

function sanitizeFallbackFileName(fileName: string) {
  const normalized = fileName
    .replace(/[\\/]+/g, '-')
    .replace(/\.\.(?=[\\/]|$)/g, '')
    .replace(/^\.+/, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+$/, '')
    .trim();

  return normalized || 'file';
}

function buildS3ObjectKey(fileName: string, options: UploadFolderOptions, context: 'presigned' | 'server-upload') {
  const folder = options.folder || 'uploads';

  if (folder === 'chat') {
    if (options.conversationId && options.messageId) {
      const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
      const uuid = crypto.randomUUID();
      const env = process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV || 'development';
      const fileType = options.fileType || 'file'; // image, video, thumb, etc.

      return `chat/env=${env}/conv_${options.conversationId}/msg_${options.messageId}/${fileType}/${uuid}${ext ? '.' + ext : ''}`;
    }

    console.warn('[S3 Upload] Falling back to generic chat key due to missing metadata', {
      context,
      folder,
      hasConversationId: Boolean(options.conversationId),
      hasMessageId: Boolean(options.messageId),
      fileName,
      fileType: options.fileType || null,
    });
  }

  if (folder === 'tickets' || folder.startsWith('tickets')) {
    const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
    const uuid = crypto.randomUUID();
    const env = process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV || 'development';
    
    let fileType = options.fileType;
    if (!fileType && ext) {
      const lowerExt = ext.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(lowerExt)) {
        fileType = 'image';
      } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(lowerExt)) {
        fileType = 'video';
      } else if (lowerExt === 'pdf') {
        fileType = 'pdf';
      }
    }
    fileType = fileType || 'file';

    const ticketId = options.ticketId || 'temp';

    if (options.messageId) {
      return `tickets/env=${env}/ticket_${ticketId}/msg_${options.messageId}/${fileType}/${uuid}${ext ? '.' + ext : ''}`;
    }
    return `tickets/env=${env}/ticket_${ticketId}/${fileType}/${uuid}${ext ? '.' + ext : ''}`;
  }

  const safeFileName = sanitizeFallbackFileName(fileName);
  return `${folder}/${Date.now()}-${safeFileName}`;
}

/**
 * Generates a presigned URL for uploading a file to S3.
 */
export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
  folderOrOptions:
    | string
    | UploadFolderOptions = 'uploads'
) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const options = typeof folderOrOptions === 'string' ? { folder: folderOrOptions } : folderOrOptions;
  const key = buildS3ObjectKey(fileName, options, 'presigned');

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

export async function getPresignedUploadPostPolicy(
  fileName: string,
  contentType: string,
  fileSize: number,
  folderOrOptions:
    | string
    | UploadFolderOptions = 'uploads'
) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const options = typeof folderOrOptions === 'string' ? { folder: folderOrOptions } : folderOrOptions;
  const key = buildS3ObjectKey(fileName, options, 'presigned');

  const post = await createPresignedPost(s3Client, {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: 3600,
    Conditions: [
      ['content-length-range', 1, fileSize],
      ['eq', '$Content-Type', contentType],
      ['starts-with', '$key', `${options.folder || 'uploads'}/`],
    ],
    Fields: {
      'Content-Type': contentType,
      key,
    },
  });

  return {
    url: post.url,
    fields: post.fields,
    key,
  };
}

export type PresignedDownloadOverrides = {
  fileName?: string;
  contentType?: string;
  cacheControl?: string;
};

function buildContentDisposition(fileName: string): string {
  const asciiFallback = fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, '')
    .replace(/[\r\n]/g, '');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Generates a presigned URL for downloading/viewing a file from S3.
 * Max expiration is 7 days (604800 seconds).
 * Optionally pass response-header overrides that S3 will inject into the response.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 604800,
  responseOverrides?: PresignedDownloadOverrides,
) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const commandInput: GetObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: key,
  };
  if (responseOverrides?.fileName) {
    commandInput.ResponseContentDisposition = buildContentDisposition(responseOverrides.fileName);
  }
  if (responseOverrides?.contentType) {
    commandInput.ResponseContentType = responseOverrides.contentType;
  }
  if (responseOverrides?.cacheControl) {
    commandInput.ResponseCacheControl = responseOverrides.cacheControl;
  }

  const command = new GetObjectCommand(commandInput);
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Gets a presigned URL for downloading, with Redis caching.
 * Defaults to 7 days expiration.
 * Cache key includes a suffix for response overrides so different overrides
 * don't collide.
 */
export async function getCachedPresignedDownloadUrl(
  key: string,
  expiresIn: number = 604800,
  responseOverrides?: PresignedDownloadOverrides,
) {
  const overrideSuffix = responseOverrides
    ? `:${responseOverrides.fileName ?? ''}|${responseOverrides.contentType ?? ''}`
    : '';
  const cacheKey = `s3:presigned:${key}${overrideSuffix}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch (error) {
    console.warn('Redis error fetching cached S3 URL:', error);
  }

  const url = await getPresignedDownloadUrl(key, expiresIn, responseOverrides);

  try {
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
  folderOrOptions:
    | string
    | UploadFolderOptions = 'uploads'
) {
  if (!BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }

  const options = typeof folderOrOptions === 'string' ? { folder: folderOrOptions } : folderOrOptions;
  const key = buildS3ObjectKey(fileName, options, 'server-upload');

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
