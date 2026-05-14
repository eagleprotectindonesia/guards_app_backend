import { ChatInboxItem, ConversationKey, GroupChatConversation } from '@repo/types';

export type GroupChatListPayload =
  | GroupChatConversation[]
  | { items?: GroupChatConversation[]; groups?: GroupChatConversation[] | GroupListApiItem[] };

type GroupListApiItem = {
  participant?: { unreadCount?: number };
  group?: { id?: string; title?: string };
};

export function parseGroupChatListPayload(payload: GroupChatListPayload): GroupChatConversation[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.groups)) {
    return payload.groups
      .map(item => {
        if ('groupId' in (item as Record<string, unknown>)) {
          return item as GroupChatConversation;
        }

        const nested = item as GroupListApiItem;
        if (!nested.group?.id || !nested.group?.title) return null;

        return {
          kind: 'group',
          groupId: nested.group.id,
          title: nested.group.title,
          memberCount: 0,
          currentUserRole: 'member',
          isArchived: false,
          isMuted: false,
          unreadCount: nested.participant?.unreadCount ?? 0,
          lastMessage: null,
        } satisfies GroupChatConversation;
      })
      .filter((item): item is GroupChatConversation => item !== null);
  }
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
