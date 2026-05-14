import { ChatInboxItem, ConversationKey, GroupChatConversation } from '@repo/types';

export type GroupChatListPayload =
  | GroupChatConversation[]
  | { items?: GroupChatConversation[]; groups?: GroupChatConversation[] };

export function parseGroupChatListPayload(payload: GroupChatListPayload): GroupChatConversation[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.groups)) return payload.groups;
  return [];
}

export function mapGroupConversationToInboxItem(group: GroupChatConversation): ChatInboxItem {
  return {
    kind: 'group',
    id: group.groupId,
    title: group.title,
    subtitle: group.description ?? undefined,
    unreadCount: group.unreadCount,
    isMuted: group.isMuted,
    isArchived: group.isArchived,
    lastMessage: group.lastMessage
      ? {
          content: group.lastMessage.content,
          senderName: group.lastMessage.senderName,
          createdAt: group.lastMessage.createdAt,
        }
      : null,
  };
}

export function directSupportInboxItem(unreadCount: number, title: string): ChatInboxItem {
  return {
    kind: 'direct',
    id: 'me',
    title,
    unreadCount,
    isMuted: false,
    isArchived: false,
    lastMessage: null,
  };
}

export function inboxItemToConversationKey(item: ChatInboxItem): ConversationKey {
  if (item.kind === 'direct') {
    return { kind: 'direct', employeeId: item.id };
  }

  return { kind: 'group', groupId: item.id };
}
