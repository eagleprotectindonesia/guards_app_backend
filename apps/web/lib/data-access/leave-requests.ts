import { getCachedPresignedDownloadUrl } from '@/lib/s3';

export async function enrichLeaveRequestAttachments<T extends { attachments?: string[] }>(leaveRequest: T): Promise<T> {
  if (!leaveRequest.attachments || leaveRequest.attachments.length === 0) {
    return leaveRequest;
  }

  const attachments = await Promise.all(
    leaveRequest.attachments.map(async keyOrUrl => {
      if (keyOrUrl.startsWith('http')) return keyOrUrl;
      return getCachedPresignedDownloadUrl(keyOrUrl);
    })
  );

  return {
    ...leaveRequest,
    attachments,
  };
}

