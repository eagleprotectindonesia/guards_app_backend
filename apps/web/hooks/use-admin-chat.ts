'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/components/socket-provider';
import { Conversation, ChatMessage } from '@/types/chat';
import { uploadToS3 } from '@/lib/upload';
import { optimizeImage } from '@/lib/image-utils';
import { toast } from 'react-hot-toast';

interface UseAdminChatOptions {
  initialEmployeeId?: string | null;
  onSelectConversation?: (employeeId: string) => void;
}

export function useAdminChat(options: UseAdminChatOptions = {}) {
  const { socket, isConnected } = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [typingEmployees, setTypingEmployees] = useState<Record<string, boolean>>({});

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  // ... fetchConversations ...
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

  const handleSelectConversation = useCallback(async (employeeId: string, skipCallback = false) => {
    // Prevent redundant fetches if already loading or viewing this employee
    if (lastFetchedIdRef.current === employeeId && messages.length > 0) {
      setActiveEmployeeId(employeeId);
      return;
    }

    setActiveEmployeeId(employeeId);
    lastFetchedIdRef.current = employeeId;

    if (!skipCallback && options.onSelectConversation) {
      options.onSelectConversation(employeeId);
    }

    setIsLoading(true);

    // Optimistically clear unread count locally
    setConversations(prev => prev.map(c => (c.employeeId === employeeId ? { ...c, unreadCount: 0 } : c)));

    try {
      const res = await fetch(`/api/shared/chat/${employeeId}`);
      if (res.ok) {
        const data = await res.json();
        const reversed: ChatMessage[] = data.reverse();
        setMessages(reversed);
        if (socket) {
          const unreadIds = reversed
            .filter((m: ChatMessage) => m.sender === 'employee' && !m.readAt)
            .map((m: ChatMessage) => m.id);
          if (unreadIds.length > 0) {
            socket.emit('mark_read', { employeeId, messageIds: unreadIds });
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages', err);
    } finally {
      setIsLoading(false);
    }
  }, [options.onSelectConversation, socket, messages.length]);

  // Sync with initialEmployeeId (e.g. from URL)
  useEffect(() => {
    if (options.initialEmployeeId && options.initialEmployeeId !== activeEmployeeId) {
      handleSelectConversation(options.initialEmployeeId, true);
    }
  }, [options.initialEmployeeId, handleSelectConversation, activeEmployeeId]);

  useEffect(() => {
    if (socket) {
      socket.on('new_message', (message: ChatMessage) => {
        // Play sound if sender is employee
        if (message.sender === 'employee') {
          playNotificationSound();
        }

        if (activeEmployeeId === message.employeeId) {
          setMessages(prev => [...prev, message]);
          if (message.sender === 'employee') {
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

      socket.on('messages_read', (data: { employeeId: string; messageIds?: string[] }) => {
        setConversations(prev => prev.map(c => (c.employeeId === data.employeeId ? { ...c, unreadCount: 0 } : c)));
        if (activeEmployeeId === data.employeeId && data.messageIds) {
          setMessages(prev =>
            prev.map(m => (data.messageIds?.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m))
          );
        }
      });

      socket.on('typing', (data: { employeeId: string; isTyping: boolean }) => {
        setTypingEmployees(prev => ({ ...prev, [data.employeeId]: data.isTyping }));
      });

      return () => {
        socket.off('new_message');
        socket.off('messages_read');
        socket.off('typing');
      };
    }
  }, [socket, activeEmployeeId, fetchConversations]);

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
    isLoading,
    isUploading,
    isOptimizing,
    selectedFiles,
    previews,
    typingEmployees,
    isConnected,
    socket,
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
