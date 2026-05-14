import { ChatInboxItem, Conversation, GroupChatConversation } from '@repo/types';

export function mapDirectConversationToInboxItem(conversation: Conversation): ChatInboxItem {
  return {
    kind: 'direct',
    id: conversation.employeeId,
    title: conversation.employeeName,
    subtitle: conversation.employeeNumber,
    unreadCount: conversation.unreadCount,
    isMuted: conversation.isMuted,
    isArchived: conversation.isArchived,
    lastMessage: conversation.lastMessage
      ? {
          content: conversation.lastMessage.content,
          senderName:
            conversation.lastMessage.sender === 'admin'
              ? conversation.lastMessage.adminName || 'Admin'
              : conversation.employeeName,
          createdAt: conversation.lastMessage.createdAt,
        }
      : null,
  };
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
