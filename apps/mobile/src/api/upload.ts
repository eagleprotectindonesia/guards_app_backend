import { client } from './client';

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  fileName: string;
  contentType: string;
}

export interface UploadResponse {
  url: string;
  key: string;
  fileName: string;
  contentType: string;
  size: number;
}

/**
 * Gets a presigned URL for uploading a file to S3.
 */
export async function getPresignedUrl(
  fileName: string,
  contentType: string,
  size: number,
  folder: string = 'uploads'
): Promise<PresignedUrlResponse> {
  const response = await client.post('/api/shared/upload-url', {
    fileName,
    contentType,
    fileSize: size,
    folder,
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
  folder: string = 'uploads'
): Promise<UploadResponse> {
  // 1. Get presigned URL
  const { uploadUrl, publicUrl, key } = await getPresignedUrl(
    fileName,
    contentType,
    size,
    folder
  );

  // 2. Convert URI to Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function (e) {
      console.error('Blob conversion failed:', e);
      reject(new TypeError('Network request failed'));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

  // 3. Upload the file directly to S3 (Frontend to S3)
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
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
