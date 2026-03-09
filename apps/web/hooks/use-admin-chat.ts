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

const reorderConversation = (items: Conversation[], employeeId: string) => {
  const index = items.findIndex(item => item.employeeId === employeeId);
  if (index <= 0) return items;

  const updated = [...items];
  const [moved] = updated.splice(index, 1);
  updated.unshift(moved);
  return updated;
};

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
  const [persistedConversations, setPersistedConversations] = useState<Conversation[]>([]);
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null);
  const [pendingArchivedLaunch, setPendingArchivedLaunch] = useState<AdminChatLaunchPayload | null>(null);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

      const res = await fetch(url.toString());
      if (!res.ok) return;

      const data = (await res.json()) as Conversation[];
      setArchivedEmployeeIds(data.map(conversation => conversation.employeeId));
    } catch (err) {
      console.error('Failed to fetch archived conversations', err);
    }
  }, []);

  const fetchConversations = useCallback(
    async (view: ConversationView = activeView) => {
      try {
        const url = new URL('/api/shared/chat/conversations', window.location.origin);
        url.searchParams.set('view', view);

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = (await res.json()) as Conversation[];
          setPersistedConversations(data);

          if (draftConversation && data.some(conversation => conversation.employeeId === draftConversation.employeeId)) {
            setDraftConversation(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch conversations', err);
      }
    },
    [activeView, draftConversation]
  );

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

      setPersistedConversations(prev =>
        prev.map(conversation => (conversation.employeeId === employeeId ? { ...conversation, unreadCount: 0 } : conversation))
      );
    },
    [options]
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
        setPersistedConversations(prev => prev.filter(conversation => conversation.employeeId !== employeeId));
        setArchivedEmployeeIds(prev => (prev.includes(employeeId) ? prev : [...prev, employeeId]));
        if (activeEmployeeId === employeeId) {
          handleSelectConversation(null);
        }
      } else if (activeView === 'archived') {
        setPersistedConversations(prev => prev.filter(conversation => conversation.employeeId !== employeeId));
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        if (activeEmployeeId === employeeId) {
          handleSelectConversation(null);
        }
      } else {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        await fetchConversations(activeView);
      }

      await fetchAdminUnreadCount();

      return data;
    },
    [activeEmployeeId, activeView, fetchAdminUnreadCount, fetchConversations, handleSelectConversation]
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
      fetchConversations(activeView);
      return;
    }

    setPersistedConversations(prev => {
      const index = prev.findIndex(conversation => conversation.employeeId === message.employeeId);
      if (index === -1) {
        fetchConversations(activeView);
        return prev;
      }

      const updated = [...prev];
      const conversation = updated[index];
      const isCurrentlyViewing = activeEmployeeId === message.employeeId;
      const unreadCount =
        isCurrentlyViewing || message.sender === 'admin' ? conversation.unreadCount : conversation.unreadCount + 1;

      updated[index] = {
        ...conversation,
        lastMessage: {
          content: message.content,
          sender: message.sender,
          createdAt: message.createdAt,
        },
        unreadCount,
      };

      if (conversation.isArchived) {
        return updated;
      }

      return reorderConversation(updated, message.employeeId);
    });
  });

  useSocketEvent('messages_read', data => {
    setPersistedConversations(prev =>
      prev.map(conversation => (conversation.employeeId === data.employeeId ? { ...conversation, unreadCount: 0 } : conversation))
    );
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

    const unreadIds = messages.filter(message => message.sender === 'employee' && !message.readAt).map(message => message.id);

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
    if (!options.initialEmployeeId || options.initialEmployeeId === activeEmployeeId) return;

    const initialDraft = options.initialDraft?.employeeId === options.initialEmployeeId ? options.initialDraft : null;
    handleSelectConversation(options.initialEmployeeId, true, initialDraft);
  }, [activeEmployeeId, handleSelectConversation, options.initialDraft, options.initialEmployeeId]);

  useEffect(() => {
    fetchAdminUnreadCount();
    fetchArchivedConversationIds();
  }, [fetchAdminUnreadCount, fetchArchivedConversationIds]);

  useEffect(() => {
    if (!activeEmployeeId) return;

    const existsInCurrentView = conversations.some(conversation => conversation.employeeId === activeEmployeeId);
    if (!existsInCurrentView) {
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
      if (selectedFiles.length > 0) {
        const messageId = crypto.randomUUID();
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

  const filteredConversations = conversations.filter(conversation => {
    const term = searchTerm.toLowerCase();
    return (
      conversation.employeeName.toLowerCase().includes(term) || conversation.employeeNumber?.toLowerCase().includes(term)
    );
  });

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
    setSearchTerm,
    setActiveView,
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
