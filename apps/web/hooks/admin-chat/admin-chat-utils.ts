import { Conversation } from '@/types/chat';
import type { AdminChatLaunchPayload } from '@/hooks/use-admin-chat';

export const buildDraftConversation = (payload: AdminChatLaunchPayload): Conversation => ({
  employeeId: payload.employeeId,
  employeeName: payload.employeeName,
  employeeNumber: payload.employeeNumber || payload.employeeId,
  isArchived: false,
  isMuted: false,
  isDraft: true,
  unreadCount: 0,
  lastMessage: {
    content: '',
    sender: 'admin',
    createdAt: new Date().toISOString(),
  },
});
