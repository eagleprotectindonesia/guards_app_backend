import { client } from './client';
import { File } from 'expo-file-system';
import { captureException } from '../utils/sentry';

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  fileName: string;
  contentType: string;
}

export interface UploadOptions {
  folder?: string;
  conversationId?: string;
  messageId?: string;
  fileType?: string;
  ticketId?: string;
}

export interface UploadResponse {
  url: string;
  key: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface ChatDraftResponse {
  messageId: string;
  expiresAt: string;
}

function assertValidChatUploadOptions(options: UploadOptions) {
  if (options.folder !== 'chat' && options.folder !== 'group-chat') return;

  if (!options.conversationId?.trim()) {
    throw new Error('Chat uploads require a conversationId');
  }

  if (!options.messageId?.trim()) {
    throw new Error('Chat uploads require a messageId');
  }
}

export async function reserveChatDraft(employeeId: string): Promise<ChatDraftResponse> {
  const response = await client.post(`/api/shared/chat/${employeeId}/draft`);
  return response.data as ChatDraftResponse;
}

export async function reserveGroupChatDraft(groupId: string): Promise<ChatDraftResponse> {
  const response = await client.post(`/api/shared/group-chat/${groupId}/draft`);
  return response.data as ChatDraftResponse;
}

/**
 * Gets a presigned URL for uploading a file to S3.
 */
export async function getPresignedUrl(
  fileName: string,
  contentType: string,
  size: number,
  folderOrOptions: string | UploadOptions = 'uploads'
): Promise<PresignedUrlResponse> {
  const options = typeof folderOrOptions === 'string' ? { folder: folderOrOptions } : folderOrOptions;
  assertValidChatUploadOptions(options);
  const response = await client.post('/api/shared/upload-url', {
    fileName,
    contentType,
    fileSize: size,
    ...options,
  });

  return response.data;
}

/**
 * Uploads a file directly to S3 using a presigned URL.
 * In React Native, we need to convert the URI to a blob first.
 */
export async function uploadToS3(
  uri: string,
  fileName: string,
  contentType: string,
  size: number,
  folderOrOptions: string | UploadOptions = 'uploads',
  photoDimensions?: { width?: number; height?: number }
): Promise<UploadResponse> {
  const extraBase = {
    fileName,
    contentType,
    size,
    folder: typeof folderOrOptions === 'string' ? folderOrOptions : folderOrOptions.folder,
    ...photoDimensions,
  };

  let presignedResult: { uploadUrl: string; publicUrl: string; key: string } | null = null;
  try {
    presignedResult = await getPresignedUrl(fileName, contentType, size, folderOrOptions);
  } catch (error) {
    captureException(error, { tags: { error_family: 's3_presigned_url' }, extra: { ...extraBase } });
    throw error;
  }

  const { uploadUrl, publicUrl, key } = presignedResult;

  if (!uri?.trim()) {
    const err = new Error('Upload file URI is required');
    captureException(err, { tags: { error_family: 's3_validation' }, extra: { ...extraBase, uri } });
    throw err;
  }

  const file = new File(uri);

  if (!file.exists) {
    const err = new Error('Selected attachment is no longer available');
    captureException(err, { tags: { error_family: 's3_validation' }, extra: { ...extraBase, uri } });
    throw err;
  }

  const bytes = await file.bytes();
  const byteLength = bytes.byteLength;

  if (byteLength === 0) {
    const err = new Error('Selected attachment is empty');
    captureException(err, { tags: { error_family: 's3_validation' }, extra: { ...extraBase, uri, byteLength } });
    throw err;
  }

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Failed to upload file to S3: ${response.status} ${response.statusText}`);
    captureException(err, {
      tags: { error_family: 's3_put', s3_status: String(response.status) },
      extra: {
        ...extraBase,
        s3Status: response.status,
        s3StatusText: response.statusText,
        s3ErrorBody: errorText.slice(0, 1000),
        byteLength,
      },
    });
    throw err;
  }

  return {
    url: publicUrl,
    key: key,
    fileName: fileName,
    contentType: contentType,
    size: size,
  };
}
