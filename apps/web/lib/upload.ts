export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  fileName: string;
  contentType: string;
}

export interface UploadResponse {
  url: string;
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
  folder: string = "uploads"
): Promise<PresignedUrlResponse> {
  const response = await fetch("/api/shared/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName,
      contentType,
      fileSize: size,
      folder,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get upload URL");
  }

  return response.json();
}

/**
 * Uploads a file directly to S3 using a presigned URL.
 */
export async function uploadToS3(file: File, folder: string = "uploads"): Promise<UploadResponse> {
  // 1. Get presigned URL
  const { uploadUrl, publicUrl } = await getPresignedUrl(
    file.name,
    file.type,
    file.size,
    folder
  );

  // 2. Upload the file directly to S3 (Frontend to S3)
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload file to S3");
  }

  return {
    url: publicUrl,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  };
}