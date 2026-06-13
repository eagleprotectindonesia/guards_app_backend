'use client';

import { useState } from 'react';
import { InfiniteData, QueryClient } from '@tanstack/react-query';
import { Conversation, ChatMessage } from '@/types/chat';
import { useSocketEvent } from '@/hooks/use-socket-event';

interface UseAdminChatSocketEventsParams {
  queryClient: QueryClient;
  emitMarkRead: ((payload: { employeeId: string; messageIds: string[] }) => void) | null;
  isChatVisible: boolean;
  activeEmployeeId: string | null;
  conversations: Conversation[];
  persistedConversations: Conversation[];
  archivedEmployeeIds: string[];
  draftConversation: Conversation | null;
  setDraftConversation: React.Dispatch<React.SetStateAction<Conversation | null>>;
  fetchConversations: (view?: 'inbox' | 'unread' | 'archived') => void;
  fetchAdminUnreadCount: () => Promise<void>;
  updateConversationInCache: (employeeId: string, updater: (conv: Conversation) => Conversation) => void;
  reorderConversationInCache: (employeeId: string) => void;
  playNotificationSound: () => void;
}

export function useAdminChatSocketEvents({
  queryClient,
  emitMarkRead,
  isChatVisible,
  activeEmployeeId,
  conversations,
  persistedConversations,
  archivedEmployeeIds,
  draftConversation,
  setDraftConversation,
  fetchConversations,
  fetchAdminUnreadCount,
  updateConversationInCache,
  reorderConversationInCache,
  playNotificationSound,
}: UseAdminChatSocketEventsParams) {
  const [typingEmployees, setTypingEmployees] = useState<Record<string, boolean>>({});
  const [conversationLocks, setConversationLocks] = useState<Record<string, { lockedBy: string; expiresAt: number }>>(
    {}
  );

  useSocketEvent('new_message', message => {
    const existingConversation = conversations.find(conversation => conversation.employeeId === message.employeeId);
    const isArchivedConversation = existingConversation?.isArchived ?? archivedEmployeeIds.includes(message.employeeId);

    if (message.sender === 'employee' && !isArchivedConversation) {
      playNotificationSound();
    }

    if (activeEmployeeId === message.employeeId) {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['admin', 'chat', 'messages', activeEmployeeId], old => {
        if (!old || !old.pages || old.pages.length === 0) {
          return {
            pages: [[message]],
            pageParams: [undefined],
          };
        }

        const alreadyExists = old.pages.some(page => page.some(currentMessage => currentMessage.id === message.id));
        if (alreadyExists) return old;

        return {
          ...old,
          pages: [[message, ...old.pages[0]], ...old.pages.slice(1)],
        };
      });

      if (message.sender === 'employee' && emitMarkRead && isChatVisible) {
        emitMarkRead({ employeeId: message.employeeId, messageIds: [message.id] });
      }
    }

    void fetchAdminUnreadCount();

    if (draftConversation?.employeeId === message.employeeId) {
      setDraftConversation(null);
      fetchConversations();
      return;
    }

    const isKnown = persistedConversations.some(c => c.employeeId === message.employeeId);
    if (!isKnown) {
      fetchConversations();
      return;
    }

    updateConversationInCache(message.employeeId, conv => {
      const isCurrentlyViewing = activeEmployeeId === message.employeeId;
      const unreadCount = isCurrentlyViewing || message.sender === 'admin' ? conv.unreadCount : conv.unreadCount + 1;
      return {
        ...conv,
        lastMessage: {
          content: message.content,
          sender: message.sender,
          createdAt: message.createdAt,
        },
        unreadCount,
      };
    });

    if (!persistedConversations.find(c => c.employeeId === message.employeeId)?.isArchived) {
      reorderConversationInCache(message.employeeId);
    }
  });

  useSocketEvent('messages_read', data => {
    updateConversationInCache(data.employeeId, conv => ({ ...conv, unreadCount: 0 }));
    void fetchAdminUnreadCount();

    if (activeEmployeeId === data.employeeId && data.messageIds) {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['admin', 'chat', 'messages', activeEmployeeId], old => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page =>
            page.map(message =>
              data.messageIds?.includes(message.id) ? { ...message, readAt: new Date().toISOString() } : message
            )
          ),
        };
      });
    }
  });

  useSocketEvent('typing', data => {
    setTypingEmployees(prev => ({ ...prev, [data.employeeId]: data.isTyping }));

    if (data.isTyping) {
      setTimeout(() => {
        setTypingEmployees(prev => {
          const updated = { ...prev };
          if (updated[data.employeeId]) {
            delete updated[data.employeeId];
          }
          return updated;
        });
      }, 5000);
    }
  });

  useSocketEvent('conversation_locked', data => {
    setConversationLocks(prev => ({
      ...prev,
      [data.employeeId]: { lockedBy: data.lockedBy, expiresAt: data.expiresAt },
    }));

    const timeout = data.expiresAt - Date.now();
    if (timeout > 0) {
      setTimeout(() => {
        setConversationLocks(prev => {
          const updated = { ...prev };
          if (updated[data.employeeId]?.expiresAt === data.expiresAt) {
            delete updated[data.employeeId];
          }
          return updated;
        });
      }, timeout);
    }
  });

  return {
    typingEmployees,
    conversationLocks,
  };
}
