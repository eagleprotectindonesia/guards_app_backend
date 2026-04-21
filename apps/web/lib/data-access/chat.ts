import {
  saveMessage as saveMessageDb,
  finalizeMessageDraft as finalizeMessageDraftDb,
  getChatMessages as getChatMessagesDb,
  getMessagesSince as getMessagesSinceDb,
} from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

/**
 * Enriches message attachments with presigned S3 URLs.
 * This is web-specific since it depends on S3 configuration.
 */
export async function enrichMessageWithUrls<T extends { attachments?: string[] }>(message: T): Promise<T> {
  if (message.attachments && message.attachments.length > 0) {
    const enrichedAttachments = await Promise.all(
      message.attachments.map(async keyOrUrl => {
        if (keyOrUrl.startsWith('http')) return keyOrUrl;
        return getCachedPresignedDownloadUrl(keyOrUrl);
      })
    );
    return { ...message, attachments: enrichedAttachments };
  }
  return message;
}

/**
 * Save a chat message and enrich attachments with S3 URLs.
 */
export async function saveMessage(data: {
  employeeId: string;
  adminId?: string;
  sender: 'admin' | 'employee';
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) {
  const message = await saveMessageDb(data);
  return enrichMessageWithUrls(message);
}

/**
 * Finalize a chat message draft and enrich attachments with S3 URLs.
 */
export async function finalizeMessageDraft(data: {
  messageId: string;
  employeeId: string;
  adminId?: string;
  sender: 'admin' | 'employee';
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) {
  const message = await finalizeMessageDraftDb(data);
  return enrichMessageWithUrls(message);
}

/**
 * Get chat messages and enrich attachments with S3 URLs.
 */
export async function getChatMessages(employeeId: string, limit = 50, cursorId?: string) {
  const messages = await getChatMessagesDb(employeeId, limit, cursorId);
  return Promise.all(messages.map(enrichMessageWithUrls));
}

/**
 * Get messages since a timestamp and enrich attachments with S3 URLs.
 */
export async function getMessagesSince(employeeId: string, since: Date) {
  const messages = await getMessagesSinceDb(employeeId, since);
  return Promise.all(messages.map(enrichMessageWithUrls));
}

// Re-export all other chat functions that don't need S3 enrichment
export {
  reserveMessageDraft,
  expireStaleChatDrafts,
  getConversationListPaginated,
  getArchivedConversationIds,
  getConversationList,
  getUnreadCount,
  setConversationArchiveState,
  getChatExportBatch,
  markAsRead,
  markAsReadForEmployee,
  markAsReadForAdmin,
  saveGuardMessage,
  chatMessageInclude,
} from '@repo/database';

export type { ConversationPage, ConversationItem } from '@repo/database';
