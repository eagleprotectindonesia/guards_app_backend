import { client } from './client';
import { File } from 'expo-file-system';

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
  if (options.folder !== 'chat') return;

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
  folderOrOptions: string | UploadOptions = 'uploads'
): Promise<UploadResponse> {
  // 1. Get presigned URL
  const { uploadUrl, publicUrl, key } = await getPresignedUrl(fileName, contentType, size, folderOrOptions);

  if (!uri?.trim()) {
    throw new Error('Upload file URI is required');
  }

  // 2. Use Expo's native file abstraction instead of fetching the local URI through XHR.
  const file = new File(uri);

  if (!file.exists) {
    console.error('Local upload file does not exist:', uri);
    throw new Error('Selected attachment is no longer available');
  }

  const bytes = await file.bytes();
  const byteLength = bytes.byteLength;

  if (byteLength === 0) {
    throw new Error('Selected attachment is empty');
  }

  // 3. Upload the file directly to S3 (Frontend to S3)
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: bytes,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('S3 Upload Error:', errorText);
    throw new Error('Failed to upload file to S3');
  }

  return {
    url: publicUrl,
    key: key,
    fileName: fileName,
    contentType: contentType,
    size: size,
  };
}
