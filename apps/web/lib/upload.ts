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

function assertValidChatUploadOptions(options: UploadOptions) {
  if (options.folder !== 'chat') return;

  if (!options.conversationId?.trim()) {
    throw new Error('Chat uploads require a conversationId');
  }

  if (!options.messageId?.trim()) {
    throw new Error('Chat uploads require a messageId');
  }
}

/**
 * Toggle between presigned URL (client-side) and server-side upload.
 * Client-side upload is preferred for large files like videos.
 */
export const USE_PRESIGNED_URL = true;

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
  const response = await fetch('/api/shared/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName,
      contentType,
      fileSize: size,
      ...options,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get upload URL');
  }

  return response.json();
}

/**
 * Uploads a file directly to S3 using a presigned URL.
 */
async function uploadToS3Presigned(file: File, options: string | UploadOptions = 'uploads'): Promise<UploadResponse> {
  // 1. Get presigned URL
  const { uploadUrl, publicUrl, key } = await getPresignedUrl(file.name, file.type, file.size, options);

  // 2. Upload the file directly to S3 (Frontend to S3)
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file to S3');
  }

  return {
    url: publicUrl,
    key: key,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  };
}

/**
 * Uploads a file through the server.
 */
async function uploadThroughServer(
  file: File,
  folderOrOptions: string | UploadOptions = 'uploads'
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const options = typeof folderOrOptions === 'string' ? { folder: folderOrOptions } : folderOrOptions;
  assertValidChatUploadOptions(options);
  if (options.folder) formData.append('folder', options.folder);
  if (options.conversationId) formData.append('conversationId', options.conversationId);
  if (options.messageId) formData.append('messageId', options.messageId);
  if (options.fileType) formData.append('fileType', options.fileType);

  const response = await fetch('/api/shared/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload file');
  }

  return response.json();
}

/**
 * Main upload function that uses either presigned URL or server-side upload based on USE_PRESIGNED_URL toggle.
 */
export async function uploadToS3(file: File, options: string | UploadOptions = 'uploads'): Promise<UploadResponse> {
  if (USE_PRESIGNED_URL) {
    return uploadToS3Presigned(file, options);
  } else {
    return uploadThroughServer(file, options);
  }
}
