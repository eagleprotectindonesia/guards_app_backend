'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from '@/components/socket-provider';
import { useSocketEvent } from './use-socket-event';
import { Conversation, ChatMessage } from '@/types/chat';
import { uploadToS3 } from '@/lib/upload';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';
import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';

export interface AdminChatLaunchPayload {
  employeeId: string;
  employeeName: string;
  employeeNumber?: string | null;
}

interface UseAdminChatOptions {
  initialEmployeeId?: string | null;
  initialDraft?: AdminChatLaunchPayload | null;
  onSelectConversation?: (employeeId: string | null, draft?: AdminChatLaunchPayload | null) => void;
}

type ConversationView = 'inbox' | 'unread' | 'archived';


const buildDraftConversation = (payload: AdminChatLaunchPayload): Conversation => ({
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

export function useAdminChat(options: UseAdminChatOptions = {}) {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null);
  const [pendingArchivedLaunch, setPendingArchivedLaunch] = useState<AdminChatLaunchPayload | null>(null);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeView, setActiveView] = useState<ConversationView>('inbox');
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [archivedEmployeeIds, setArchivedEmployeeIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [typingEmployees, setTypingEmployees] = useState<Record<string, boolean>>({});
  const [conversationLocks, setConversationLocks] = useState<Record<string, { lockedBy: string; expiresAt: number }>>(
    {}
  );
  const [isInitialSelectionReady, setIsInitialSelectionReady] = useState(!options.initialEmployeeId);
  const [canRestoreInitialSelection, setCanRestoreInitialSelection] = useState(!options.initialEmployeeId);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialEmployeeIdRef = useRef(options.initialEmployeeId ?? null);
  const initialDraftRef = useRef(
    options.initialDraft?.employeeId === options.initialEmployeeId ? options.initialDraft : null
  );
  const hasBootstrappedInitialSelectionRef = useRef(false);

  // Debounce search term 300ms before including it in the query key
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ─── Conversation list (infinite query) ─────────────────────────────────────
  type ConversationPageResponse = { conversations: Conversation[]; nextCursor: string | null };
  const conversationQueryKey = ['admin', 'chat', 'conversations', activeView, debouncedSearch] as const;

  const {
    data: conversationData,
    fetchNextPage: fetchNextConversationPage,
    hasNextPage: hasNextConversationPage,
    isFetchingNextPage: isFetchingNextConversationPage,
    isLoading: isConversationsLoading,
  } = useInfiniteQuery({
    queryKey: conversationQueryKey,
    queryFn: async ({ pageParam }) => {
      const url = new URL('/api/shared/chat/conversations', window.location.origin);
      url.searchParams.set('view', activeView);
      url.searchParams.set('limit', '10');
      if (pageParam) url.searchParams.set('cursor', pageParam);
      if (debouncedSearch) url.searchParams.set('search', debouncedSearch);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json() as Promise<ConversationPageResponse>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 30,
  });

  // Flat list of all loaded conversation pages, draft prepended if needed
  const persistedConversations = useMemo<Conversation[]>(() => {
    return conversationData?.pages.flatMap((p) => p.conversations) ?? [];
  }, [conversationData]);

  // Helper to invalidate and refetch conversations
  const fetchConversations = useCallback(
    (view?: ConversationView) => {
      void queryClient.invalidateQueries({
        queryKey: view
          ? ['admin', 'chat', 'conversations', view]
          : conversationQueryKey.slice(0, 3),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, conversationQueryKey.join('|')]
  );

  // Helper to optimistically update a single conversation in the infinite cache
  const updateConversationInCache = useCallback(
    (employeeId: string, updater: (conv: Conversation) => Conversation) => {
      queryClient.setQueryData<InfiniteData<ConversationPageResponse>>(conversationQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            conversations: page.conversations.map((conv) =>
              conv.employeeId === employeeId ? updater(conv) : conv
            ),
          })),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, conversationQueryKey.join('|')]
  );

  // Helper to move a conversation to the top of the first page in cache
  const reorderConversationInCache = useCallback(
    (employeeId: string) => {
      queryClient.setQueryData<InfiniteData<ConversationPageResponse>>(conversationQueryKey, (old) => {
        if (!old) return old;
        const allConvs = old.pages.flatMap((p) => p.conversations);
        const idx = allConvs.findIndex((c) => c.employeeId === employeeId);
        if (idx <= 0) return old; // already first or not found
        const [moved] = allConvs.splice(idx, 1);
        allConvs.unshift(moved);
        // Redistribute back across pages preserving page sizes
        const pageSizes = old.pages.map((p) => p.conversations.length);
        let offset = 0;
        const newPages = old.pages.map((page, i) => ({
          ...page,
          conversations: allConvs.slice(offset, (offset += pageSizes[i])),
        }));
        return { ...old, pages: newPages };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, conversationQueryKey.join('|')]
  );

  const reserveChatDraft = useCallback(async (employeeId: string) => {
    const response = await fetch(`/api/shared/chat/${employeeId}/draft`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error || 'Failed to reserve chat draft');
    }

    const body = (await response.json()) as { messageId?: string };
    if (!body.messageId) {
      throw new Error('Draft reservation did not return a messageId');
    }

    return body.messageId;
  }, []);
  const shouldClearSelectionOnViewMismatchRef = useRef(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
  } = useInfiniteQuery({
    queryKey: ['admin', 'chat', 'messages', activeEmployeeId],
    queryFn: async ({ pageParam }) => {
      if (!activeEmployeeId) return [];
      const url = new URL(`/api/shared/chat/${activeEmployeeId}`, window.location.origin);
      url.searchParams.set('limit', '20');
      if (pageParam) {
        url.searchParams.set('cursor', pageParam);
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json() as Promise<ChatMessage[]>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => {
      if (lastPage.length < 20) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!activeEmployeeId,
    staleTime: 1000 * 60,
  });

  const messages = useMemo(() => {
    const allMessages = data?.pages.flat() || [];
    return [...allMessages].reverse();
  }, [data]);

  const conversations = useMemo(() => {
    if (!draftConversation) return persistedConversations;
    if (persistedConversations.some(conversation => conversation.employeeId === draftConversation.employeeId)) {
      return persistedConversations;
    }
    return [draftConversation, ...persistedConversations];
  }, [draftConversation, persistedConversations]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/audios/chat.wav');
    }

    const unlockAudio = () => {
      if (audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            audioRef.current?.pause();
            if (audioRef.current) audioRef.current.currentTime = 0;
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
          })
          .catch(() => {});
      }
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => console.error('Failed to play chat sound', err));
    }
  }, []);

  const fetchAdminUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/shared/chat/unread?role=admin');
      if (!res.ok) return;

      const data = (await res.json()) as { count: number };
      setAdminUnreadCount(data.count);
    } catch (err) {
      console.error('Failed to fetch admin unread count', err);
    }
  }, []);

  const fetchArchivedConversationIds = useCallback(async () => {
    try {
      const url = new URL('/api/shared/chat/conversations', window.location.origin);
      url.searchParams.set('view', 'archived');
      url.searchParams.set('limit', '200'); // fetch enough IDs for launch validation

      const res = await fetch(url.toString());
      if (!res.ok) return;

      const data = (await res.json()) as { conversations: Conversation[]; nextCursor: string | null };
      setArchivedEmployeeIds(data.conversations.map((c) => c.employeeId));
    } catch (err) {
      console.error('Failed to fetch archived conversations', err);
    }
  }, []);

  const handleSelectConversation = useCallback(
    async (employeeId: string | null, skipCallback = false, draft?: AdminChatLaunchPayload | null) => {
      setActiveEmployeeId(employeeId);

      if (!skipCallback && options.onSelectConversation) {
        options.onSelectConversation(employeeId, draft || null);
      }

      if (!employeeId) return;

      if (draft) {
        setDraftConversation(buildDraftConversation(draft));
      }

      updateConversationInCache(employeeId, (conv) => ({ ...conv, unreadCount: 0 }));
    },
    [options, updateConversationInCache]
  );

  const handleViewChange = useCallback(
    (view: ConversationView) => {
      shouldClearSelectionOnViewMismatchRef.current = true;
      setActiveView(view);
      handleSelectConversation(null);
    },
    [handleSelectConversation]
  );

  const archiveConversation = useCallback(
    async (employeeId: string, isArchived: boolean) => {
      const res = await fetch(`/api/shared/chat/conversations/${employeeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isArchived }),
      });

      if (!res.ok) {
        throw new Error('Failed to update archive state');
      }

      const data = (await res.json()) as Pick<Conversation, 'employeeId' | 'isArchived' | 'isMuted'>;

      if (isArchived) {
        setArchivedEmployeeIds(prev => (prev.includes(employeeId) ? prev : [...prev, employeeId]));

        if (activeEmployeeId === employeeId) {
          setActiveView('archived');
        }
        // Invalidate both views so stale conversations disappear
        fetchConversations('inbox');
        fetchConversations('archived');
      } else if (activeEmployeeId === employeeId) {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        setActiveView('inbox');
        fetchConversations('inbox');
        fetchConversations('archived');
      } else if (activeView === 'archived') {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        fetchConversations('archived');
      } else {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        fetchConversations(activeView);
      }

      await fetchAdminUnreadCount();

      return data;
    },
    [activeEmployeeId, activeView, fetchAdminUnreadCount, fetchConversations]
  );

  const handleArchiveConversation = useCallback(
    async (employeeId: string) => {
      try {
        await archiveConversation(employeeId, true);
      } catch (error) {
        console.error('Failed to archive conversation:', error);
        toast.error('Failed to archive conversation');
      }
    },
    [archiveConversation]
  );

  const handleUnarchiveConversation = useCallback(
    async (employeeId: string) => {
      try {
        await archiveConversation(employeeId, false);
      } catch (error) {
        console.error('Failed to unarchive conversation:', error);
        toast.error('Failed to unarchive conversation');
      }
    },
    [archiveConversation]
  );

  const openConversationFromLaunch = useCallback(
    async (launch: AdminChatLaunchPayload) => {
      const existingConversation = conversations.find(conversation => conversation.employeeId === launch.employeeId);

      if (archivedEmployeeIds.includes(launch.employeeId) && !existingConversation?.isDraft) {
        setPendingArchivedLaunch(launch);
        return;
      }

      setActiveView('inbox');
      await handleSelectConversation(launch.employeeId, false, existingConversation ? null : launch);
    },
    [archivedEmployeeIds, conversations, handleSelectConversation]
  );

  const confirmArchivedLaunch = useCallback(async () => {
    if (!pendingArchivedLaunch) return;

    const launch = pendingArchivedLaunch;
    setPendingArchivedLaunch(null);
    setActiveView('inbox');
    await archiveConversation(launch.employeeId, false);
    await fetchConversations('inbox');
    await handleSelectConversation(launch.employeeId, false, null);
  }, [archiveConversation, fetchConversations, handleSelectConversation, pendingArchivedLaunch]);

  const cancelArchivedLaunch = useCallback(() => {
    setPendingArchivedLaunch(null);
  }, []);

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

      if (message.sender === 'employee' && socket) {
        socket.emit('mark_read', { employeeId: message.employeeId, messageIds: [message.id] });
      }
    }

    fetchAdminUnreadCount();

    if (draftConversation?.employeeId === message.employeeId) {
      setDraftConversation(null);
      fetchConversations();
      return;
    }

    // Check if the employee is in the currently loaded pages
    const isKnown = persistedConversations.some((c) => c.employeeId === message.employeeId);
    if (!isKnown) {
      // New conversation — invalidate to bring it in
      fetchConversations();
      return;
    }

    // Optimistically update + reorder in cache
    updateConversationInCache(message.employeeId, (conv) => {
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

    if (!persistedConversations.find((c) => c.employeeId === message.employeeId)?.isArchived) {
      reorderConversationInCache(message.employeeId);
    }
  });

  useSocketEvent('messages_read', data => {
    updateConversationInCache(data.employeeId, (conv) => ({ ...conv, unreadCount: 0 }));
    fetchAdminUnreadCount();

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

  useEffect(() => {
    if (!activeEmployeeId || !socket || !messages.length) return;

    const unreadIds = messages
      .filter(message => message.sender === 'employee' && !message.readAt)
      .map(message => message.id);

    if (unreadIds.length > 0) {
      socket.emit('mark_read', { employeeId: activeEmployeeId, messageIds: unreadIds });
    }
  }, [activeEmployeeId, messages, socket]);

  useEffect(() => {
    if (options.initialDraft) {
      setDraftConversation(buildDraftConversation(options.initialDraft));
    }
  }, [options.initialDraft]);

  useEffect(() => {
    if (hasBootstrappedInitialSelectionRef.current) {
      return;
    }

    hasBootstrappedInitialSelectionRef.current = true;
    let cancelled = false;

    const restoreInitialConversation = async () => {
      const initialEmployeeId = initialEmployeeIdRef.current;
      const initialDraft = initialDraftRef.current;

      if (!initialEmployeeId) {
        setCanRestoreInitialSelection(false);
        setIsInitialSelectionReady(true);
        return;
      }

      if (initialDraft) {
        setActiveView('inbox');
        setCanRestoreInitialSelection(true);
        if (!cancelled) {
          setIsInitialSelectionReady(true);
        }
        return;
      }

      try {
        // Use the paginated API to check archived status — just grab a large batch of IDs
        const url = new URL('/api/shared/chat/conversations', window.location.origin);
        url.searchParams.set('view', 'archived');
        url.searchParams.set('limit', '200');
        const res = await fetch(url.toString());
        if (cancelled) return;

        const archivedData = res.ok
          ? ((await res.json()) as { conversations: Conversation[]; nextCursor: string | null })
          : { conversations: [], nextCursor: null };

        const archivedEmployees = archivedData.conversations.map((c) => c.employeeId);
        const isArchived = archivedEmployees.includes(initialEmployeeId);
        const targetView: ConversationView = isArchived ? 'archived' : 'inbox';

        if (cancelled) return;
        setArchivedEmployeeIds(archivedEmployees);
        setActiveView(targetView);

        const canRestore = isArchived
          ? archivedData.conversations.some((c) => c.employeeId === initialEmployeeId)
          : true; // inbox will be fetched by useInfiniteQuery automatically
        setCanRestoreInitialSelection(canRestore);
      } catch (error) {
        console.error('Failed to restore initial conversation view', error);
        if (cancelled) return;
        setActiveView('inbox');
        setCanRestoreInitialSelection(false);
      } finally {
        if (!cancelled) {
          setIsInitialSelectionReady(true);
        }
      }
    };

    setIsInitialSelectionReady(false);
    void restoreInitialConversation();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !isInitialSelectionReady ||
      !canRestoreInitialSelection ||
      !initialEmployeeIdRef.current ||
      initialEmployeeIdRef.current === activeEmployeeId
    ) {
      return;
    }

    handleSelectConversation(initialEmployeeIdRef.current, true, initialDraftRef.current);
    setCanRestoreInitialSelection(false);
  }, [activeEmployeeId, canRestoreInitialSelection, handleSelectConversation, isInitialSelectionReady]);

  useEffect(() => {
    fetchAdminUnreadCount();
    fetchArchivedConversationIds();
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
      handleSelectConversation(null);
    }
  }, [activeEmployeeId, conversations, handleSelectConversation]);

  const handleFileChange = async (files: File[]) => {
    if (files.length === 0) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      toast.error('Only image files are allowed in this chat');
    }

    if (imageFiles.length === 0) return;

    setIsOptimizing(true);
    try {
      const processedFiles = await Promise.all(imageFiles.map(file => optimizeImage(file)));
      const currentFiles = [...selectedFiles, ...processedFiles].slice(0, 4);
      setSelectedFiles(currentFiles);
      const newPreviews = processedFiles.map(file => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews].slice(0, 4));
    } catch (error) {
      console.error('File processing failed:', error);
      toast.error('Failed to process images');
    } finally {
      setIsOptimizing(false);
    }
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles(prev => prev.filter((_, fileIndex) => fileIndex !== index));
    setPreviews(prev => prev.filter((_, previewIndex) => previewIndex !== index));
  };

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
            fileType: file.type.startsWith('video/') ? 'video' : 'image',
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
      setSelectedFiles([]);
      previews.forEach(url => URL.revokeObjectURL(url));
      setPreviews([]);

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
