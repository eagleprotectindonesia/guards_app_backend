'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { startTransition } from 'react';
import { useSocket } from '@/components/socket-provider';
import { Conversation } from '@/types/chat';
import { ChatInboxItem } from '@repo/types';
import { mapDirectConversationToInboxItem } from '@/types/chat-inbox';
import { uploadToS3 } from '@/lib/upload';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useChatNotificationAudio } from '@/hooks/admin-chat/use-chat-notification-audio';
import { useAdminChatAttachments } from '@/hooks/admin-chat/use-admin-chat-attachments';
import { useAdminChatQueries } from '@/hooks/admin-chat/use-admin-chat-queries';
import {
  invalidateConversationQueries,
  reorderConversationInCache as reorderConversationInCacheHelper,
  updateConversationInCache as updateConversationInCacheHelper,
} from '@/hooks/admin-chat/admin-chat-cache';
import {
  fetchAdminUnreadCountApi,
  fetchArchivedConversationIdsApi,
  reserveChatDraft,
} from '@/hooks/admin-chat/admin-chat-api';
import { useAdminChatArchive } from '@/hooks/admin-chat/use-admin-chat-archive';
import { useAdminChatSocketEvents } from '@/hooks/admin-chat/use-admin-chat-socket-events';
import { useAdminChatSelection } from '@/hooks/admin-chat/use-admin-chat-selection';

export interface AdminChatLaunchPayload {
  employeeId: string;
  employeeName: string;
  employeeNumber?: string | null;
}
interface UseAdminChatOptions {
  initialEmployeeId?: string | null;
  initialDraft?: AdminChatLaunchPayload | null;
  onSelectConversation?: (employeeId: string | null, draft?: AdminChatLaunchPayload | null) => void;
  isChatVisible?: boolean;
}

type ConversationView = 'inbox' | 'unread' | 'archived';

export function useAdminChat(options: UseAdminChatOptions = {}) {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const isChatVisible = options.isChatVisible ?? true;
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeView, setActiveView] = useState<ConversationView>('inbox');
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [archivedEmployeeIds, setArchivedEmployeeIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playNotificationSound } = useChatNotificationAudio();
  const { selectedFiles, previews, isOptimizing, handleFileChange, removeFile, clearFiles } = useAdminChatAttachments();

  // Debounce search term 300ms before including it in the query key
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const {
    conversationQueryKey,
    persistedConversations,
    fetchNextConversationPage,
    hasNextConversationPage,
    isFetchingNextConversationPage,
    isConversationsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isMessagesLoading,
    messages,
  } = useAdminChatQueries({
    activeView,
    debouncedSearch,
    activeEmployeeId,
  });

  // Helper to invalidate and refetch conversations
  const fetchConversations = useCallback(
    (view?: ConversationView) => {
      invalidateConversationQueries(queryClient, conversationQueryKey, view);
    },
    [queryClient, conversationQueryKey]
  );

  const updateConversationInCache = useCallback(
    (employeeId: string, updater: (conv: Conversation) => Conversation) => {
      updateConversationInCacheHelper(queryClient, conversationQueryKey, employeeId, updater);
    },
    [queryClient, conversationQueryKey]
  );

  const reorderConversationInCacheCallback = useCallback(
    (employeeId: string) => {
      reorderConversationInCacheHelper(queryClient, conversationQueryKey, employeeId);
    },
    [queryClient, conversationQueryKey]
  );
  const shouldClearSelectionOnViewMismatchRef = useRef(false);

  const fetchAdminUnreadCount = useCallback(async () => {
    try {
      const count = await fetchAdminUnreadCountApi();
      if (count === null) return;
      setAdminUnreadCount(count);
    } catch (err) {
      console.error('Failed to fetch admin unread count', err);
    }
  }, []);

  const fetchArchivedConversationIds = useCallback(async () => {
    try {
      const ids = await fetchArchivedConversationIdsApi();
      if (!ids) return;
      setArchivedEmployeeIds(ids);
    } catch (err) {
      console.error('Failed to fetch archived conversations', err);
    }
  }, []);

  const { visibleDraftConversation, handleSelectConversation, handleViewChange: selectionHandleViewChange } = useAdminChatSelection({
    initialEmployeeId: options.initialEmployeeId,
    initialDraft: options.initialDraft,
    onSelectConversation: options.onSelectConversation,
    activeEmployeeId,
    setActiveEmployeeId,
    setActiveView,
    draftConversation,
    setDraftConversation,
    setArchivedEmployeeIds,
    updateConversationInCache,
  });

  const conversations = useMemo(() => {
    if (!visibleDraftConversation) return persistedConversations;
    if (persistedConversations.some(conversation => conversation.employeeId === visibleDraftConversation.employeeId)) {
      return persistedConversations;
    }
    return [visibleDraftConversation, ...persistedConversations];
  }, [visibleDraftConversation, persistedConversations]);

  const inboxItems = useMemo<ChatInboxItem[]>(() => conversations.map(mapDirectConversationToInboxItem), [conversations]);

  const handleViewChange = useCallback(
    (view: ConversationView) => {
      shouldClearSelectionOnViewMismatchRef.current = true;
      selectionHandleViewChange(view);
    },
    [selectionHandleViewChange]
  );

  const {
    pendingArchivedLaunch,
    handleArchiveConversation,
    handleUnarchiveConversation,
    openConversationFromLaunch,
    confirmArchivedLaunch,
    cancelArchivedLaunch,
  } = useAdminChatArchive({
    activeEmployeeId,
    activeView,
    conversations,
    fetchConversations,
    fetchAdminUnreadCount,
    handleSelectConversation,
    setActiveView,
    archivedEmployeeIds,
    setArchivedEmployeeIds,
  });

  const { typingEmployees, conversationLocks } = useAdminChatSocketEvents({
    queryClient,
    emitMarkRead: socket
      ? (payload) => {
          socket.emit('mark_read', payload);
        }
      : null,
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
    reorderConversationInCache: reorderConversationInCacheCallback,
    playNotificationSound,
  });

  useEffect(() => {
    if (!activeEmployeeId || !socket || !messages.length || !isChatVisible) return;

    const unreadIds = messages
      .filter(message => message.sender === 'employee' && !message.readAt)
      .map(message => message.id);

    if (unreadIds.length > 0) {
      socket.emit('mark_read', { employeeId: activeEmployeeId, messageIds: unreadIds });
    }
  }, [activeEmployeeId, isChatVisible, messages, socket]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchAdminUnreadCount();
      void fetchArchivedConversationIds();
    });
  }, [fetchAdminUnreadCount, fetchArchivedConversationIds]);

  useEffect(() => {
    if (!activeEmployeeId) {
      shouldClearSelectionOnViewMismatchRef.current = false;
      return;
    }

    if (!shouldClearSelectionOnViewMismatchRef.current) {
      return;
    }

    const existsInCurrentView = conversations.some(conversation => conversation.employeeId === activeEmployeeId);
    if (!existsInCurrentView) {
      shouldClearSelectionOnViewMismatchRef.current = false;
      startTransition(() => {
        void handleSelectConversation(null);
      });
    }
  }, [activeEmployeeId, conversations, handleSelectConversation]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && selectedFiles.length === 0) || !activeEmployeeId || !socket || isUploading) return;

    setIsUploading(true);
    try {
      let attachments: string[] = [];
      let messageId: string | undefined;
      if (selectedFiles.length > 0) {
        messageId = await reserveChatDraft(activeEmployeeId);

        const uploadPromises = selectedFiles.map(file =>
          uploadToS3(file, {
            folder: 'chat',
            conversationId: activeEmployeeId,
            messageId,
            fileType: file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('video/') ? 'video' : 'image',
          })
        );
        const results = await Promise.all(uploadPromises);
        attachments = results.map(result => result.key);
      }

      socket.emit('send_message', {
        content: inputText.trim(),
        employeeId: activeEmployeeId,
        messageId,
        attachments,
      });

      if (draftConversation?.employeeId === activeEmployeeId) {
        setDraftConversation(null);
      }

      setInputText('');
      clearFiles();

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit('typing', { employeeId: activeEmployeeId, isTyping: false });
      fetchConversations(activeView);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsUploading(false);
    }
  };

  const handleInputChange = (value: string) => {
    setInputText(value);
    if (socket && activeEmployeeId) {
      socket.emit('typing', { employeeId: activeEmployeeId, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { employeeId: activeEmployeeId, isTyping: false });
      }, 3000);
    }
  };

  // Search is now handled server-side via debouncedSearch; filteredConversations is the same as conversations
  const filteredConversations = conversations;

  return {
    conversations,
    inboxItems,
    filteredConversations,
    draftConversation,
    pendingArchivedLaunch,
    activeEmployeeId,
    activeView,
    adminUnreadCount,
    messages,
    inputText,
    searchTerm,
    isLoading: isMessagesLoading,
    isConversationsLoading,
    isFetchingNextPage,
    hasNextPage,
    isUploading,
    isOptimizing,
    selectedFiles,
    previews,
    typingEmployees,
    conversationLocks,
    isConnected,
    socket,
    fetchNextPage,
    fetchNextConversationPage,
    hasNextConversationPage,
    isFetchingNextConversationPage,
    setSearchTerm,
    setActiveView,
    handleViewChange,
    handleSelectConversation,
    handleSendMessage,
    handleFileChange,
    removeFile,
    handleInputChange,
    fetchConversations,
    fetchAdminUnreadCount,
    handleArchiveConversation,
    handleUnarchiveConversation,
    openConversationFromLaunch,
    confirmArchivedLaunch,
    cancelArchivedLaunch,
  };
}
