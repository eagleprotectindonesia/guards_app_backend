'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from '@/components/socket-provider';
import { useSocketEvent } from './use-socket-event';
import { Conversation, ChatMessage } from '@/types/chat';
import { uploadToS3 } from '@/lib/upload';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';
import { useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';

interface UseAdminChatOptions {
  initialEmployeeId?: string | null;
  onSelectConversation?: (employeeId: string) => void;
}

export function useAdminChat(options: UseAdminChatOptions = {}) {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [typingEmployees, setTypingEmployees] = useState<Record<string, boolean>>({});
  const [conversationLocks, setConversationLocks] = useState<Record<string, { lockedBy: string; expiresAt: number }>>({});

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Use Infinite Query for messages
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
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 20) return undefined;
      return lastPage[lastPage.length - 1].id;
    },
    enabled: !!activeEmployeeId,
    // Keep data fresh but not too aggressive
    staleTime: 1000 * 60, 
  });

  const messages = useMemo(() => {
    const allMessages = data?.pages.flat() || [];
    // Sort by date ascending for display (oldest at top, newest at bottom)
    return [...allMessages].reverse();
  }, [data]);

  // Audio Logic for Chat
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

  // Fetch conversations list
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/shared/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  }, []);

  // Socket Event Handlers
  useSocketEvent('new_message', (message) => {
    // Play sound if sender is employee
    if (message.sender === 'employee') {
      playNotificationSound();
    }

    // Update messages cache
    if (activeEmployeeId === message.employeeId) {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['admin', 'chat', 'messages', activeEmployeeId], old => {
        if (!old || !old.pages || old.pages.length === 0) {
          // If no data, maybe we should invalidate or create a new one
          return {
            pages: [[message]],
            pageParams: [undefined],
          };
        }

        // Avoid duplicates
        const alreadyExists = old.pages.some(page => page.some(m => m.id === message.id));
        if (alreadyExists) return old;

        // Newest messages are at the beginning of the FIRST page in InfiniteQuery
        return {
          ...old,
          pages: [[message, ...old.pages[0]], ...old.pages.slice(1)],
        };
      });

      if (message.sender === 'employee' && socket) {
        socket.emit('mark_read', { employeeId: message.employeeId, messageIds: [message.id] });
      }
    }

    setConversations(prev => {
      const index = prev.findIndex(c => c.employeeId === message.employeeId);
      if (index === -1) {
        fetchConversations();
        return prev;
      }

      const updated = [...prev];
      const conv = updated[index];
      const isCurrentlyViewing = activeEmployeeId === message.employeeId;

      updated[index] = {
        ...conv,
        lastMessage: {
          content: message.content,
          sender: message.sender,
          createdAt: message.createdAt,
        },
        unreadCount: isCurrentlyViewing || message.sender === 'admin' ? conv.unreadCount : conv.unreadCount + 1,
      };

      const [moved] = updated.splice(index, 1);
      updated.unshift(moved);

      return updated;
    });
  });

  useSocketEvent('messages_read', (data) => {
    setConversations(prev => prev.map(c => (c.employeeId === data.employeeId ? { ...c, unreadCount: 0 } : c)));
    
    if (activeEmployeeId === data.employeeId && data.messageIds) {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['admin', 'chat', 'messages', activeEmployeeId], old => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page =>
            page.map(msg => (data.messageIds?.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg))
          ),
        };
      });
    }
  });

  useSocketEvent('typing', (data) => {
    setTypingEmployees(prev => ({ ...prev, [data.employeeId]: data.isTyping }));

    // Auto-clear typing status after 5 seconds of inactivity
    if (data.isTyping) {
      setTimeout(() => {
        setTypingEmployees(prev => {
          const updated = { ...prev };
          // Only clear if still typing (haven't received an explicit isTyping: false)
          if (updated[data.employeeId]) {
            delete updated[data.employeeId];
          }
          return updated;
        });
      }, 5000);
    }
  });

  useSocketEvent('conversation_locked', (data) => {
    setConversationLocks(prev => ({
      ...prev,
      [data.employeeId]: { lockedBy: data.lockedBy, expiresAt: data.expiresAt },
    }));

    // Auto-clear lock after it expires locally
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

  const handleSelectConversation = useCallback(async (employeeId: string, skipCallback = false) => {
    setActiveEmployeeId(employeeId);

    if (!skipCallback && options.onSelectConversation) {
      options.onSelectConversation(employeeId);
    }

    // Optimistically clear unread count locally
    setConversations(prev => prev.map(c => (c.employeeId === employeeId ? { ...c, unreadCount: 0 } : c)));

    // We don't need to manually fetch messages anymore as useInfiniteQuery handles it
    // But we might want to mark unread as read if data is already in cache or when it arrives
    // This is handled by a side effect below or when new messages arrive.
  }, [options]);

  // Handle marking messages as read when a conversation is selected
  useEffect(() => {
    if (!activeEmployeeId || !socket || !messages.length) return;

    const unreadIds = messages
      .filter((m: ChatMessage) => m.sender === 'employee' && !m.readAt)
      .map((m: ChatMessage) => m.id);

    if (unreadIds.length > 0) {
      socket.emit('mark_read', { employeeId: activeEmployeeId, messageIds: unreadIds });
    }
  }, [activeEmployeeId, messages, socket]);

  // Sync with initialEmployeeId (e.g. from URL)
  useEffect(() => {
    if (options.initialEmployeeId && options.initialEmployeeId !== activeEmployeeId) {
      handleSelectConversation(options.initialEmployeeId, true);
    }
  }, [options, handleSelectConversation, activeEmployeeId]);

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
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && selectedFiles.length === 0) || !activeEmployeeId || !socket || isUploading) return;

    setIsUploading(true);
    try {
      let attachments: string[] = [];
      if (selectedFiles.length > 0) {
        const uploadPromises = selectedFiles.map(file => uploadToS3(file, 'chat'));
        const results = await Promise.all(uploadPromises);
        attachments = results.map(r => r.key);
      }

      socket.emit('send_message', {
        content: inputText.trim(),
        employeeId: activeEmployeeId,
        attachments,
      });

      setInputText('');
      setSelectedFiles([]);
      previews.forEach(url => URL.revokeObjectURL(url));
      setPreviews([]);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit('typing', { employeeId: activeEmployeeId, isTyping: false });
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

  const filteredConversations = conversations.filter(conv => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      conv.employeeName.toLowerCase().includes(term) ||
      conv.employeeId.toLowerCase().includes(term);
    
    const matchesFilter = filterType === 'all' || conv.unreadCount > 0;

    return matchesSearch && matchesFilter;
  });

  return {
    conversations,
    filteredConversations,
    activeEmployeeId,
    messages,
    inputText,
    searchTerm,
    filterType,
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
    setFilterType,
    handleSelectConversation,
    handleSendMessage,
    handleFileChange,
    removeFile,
    handleInputChange,
    fetchConversations,
  };
}
