import {
  addGroupMembers,
  createGroupChat,
  expireStaleGroupChatDrafts,
  finalizeGroupMessageDraft as finalizeGroupMessageDraftDb,
  getGroupChatForParticipant,
  getGroupChatListForParticipant,
  getActiveGroupParticipant,
  listActiveGroupIdsForParticipant,
  listGroupChatPushTargets,
  listGroupMembers,
  getGroupMessages as getGroupMessagesDb,
  getGroupMessagesSince as getGroupMessagesSinceDb,
  leaveGroup,
  disbandGroup,
  markGroupAsRead,
  removeGroupMember,
  reserveGroupMessageDraft,
  saveGroupMessage as saveGroupMessageDb,
  updateGroupChat,
} from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

export async function enrichGroupMessageWithUrls<T extends { attachments?: string[] }>(message: T): Promise<T> {
  if (message.attachments && message.attachments.length > 0) {
    const attachments = await Promise.all(
      message.attachments.map(async keyOrUrl => {
        if (keyOrUrl.startsWith('http')) return keyOrUrl;
        return getCachedPresignedDownloadUrl(keyOrUrl);
      })
    );
    return { ...message, attachments };
  }
  return message;
}

export async function saveGroupMessage(...args: Parameters<typeof saveGroupMessageDb>) {
  const message = await saveGroupMessageDb(...args);
  return enrichGroupMessageWithUrls(message);
}

export async function finalizeGroupMessageDraft(...args: Parameters<typeof finalizeGroupMessageDraftDb>) {
  const message = await finalizeGroupMessageDraftDb(...args);
  return enrichGroupMessageWithUrls(message);
}

export async function getGroupMessages(...args: Parameters<typeof getGroupMessagesDb>) {
  const messages = await getGroupMessagesDb(...args);
  return Promise.all(messages.map(enrichGroupMessageWithUrls));
}

export async function getGroupMessagesSince(...args: Parameters<typeof getGroupMessagesSinceDb>) {
  const messages = await getGroupMessagesSinceDb(...args);
  return Promise.all(messages.map(enrichGroupMessageWithUrls));
}

export {
  createGroupChat,
  getGroupChatForParticipant,
  getGroupChatListForParticipant,
  getActiveGroupParticipant,
  listActiveGroupIdsForParticipant,
  listGroupChatPushTargets,
  listGroupMembers,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  disbandGroup,
  reserveGroupMessageDraft,
  markGroupAsRead,
  expireStaleGroupChatDrafts,
  updateGroupChat,
};
