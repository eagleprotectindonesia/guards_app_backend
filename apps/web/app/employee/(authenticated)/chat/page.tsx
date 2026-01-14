'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useSocket } from '@/components/socket-provider';
import { useProfile } from '../hooks/use-employee-queries';
import { useChatMessages, ChatMessage } from '../hooks/use-chat-queries';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TFunction } from 'i18next';

export default function GuardChatPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const { data: profile } = useProfile();
  const employeeId = profile?.id;
  
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);
  const pendingReadIds = useRef<Set<string>>(new Set());
  const readTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useChatMessages(employeeId);

  const messages = useMemo(() => {
    const allMessages = data?.pages.flat() || [];
    // Sort by date ascending for display
    return [...allMessages].reverse();
  }, [data]);

  const lastMessageId = useMemo(() => 
    messages.length > 0 ? messages[messages.length - 1].id : null
  , [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  const flushMarkRead = useCallback(() => {
    if (pendingReadIds.current.size === 0 || !socket || !employeeId) return;
    
    socket.emit('mark_read', {
      employeeId,
      messageIds: Array.from(pendingReadIds.current)
    });
    pendingReadIds.current.clear();
  }, [socket, employeeId]);

  const queueMarkRead = useCallback((id: string) => {
    pendingReadIds.current.add(id);
    if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    readTimeoutRef.current = setTimeout(flushMarkRead, 500);
  }, [flushMarkRead]);

  // Socket setup
  useEffect(() => {
    if (!socket || !employeeId) return;

    const handleNewMessage = (message: ChatMessage) => {
      console.log('GuardChatPage: New message received via socket', message);
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['chat', 'messages', employeeId], (old) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        
        // Avoid duplicates
        const alreadyExists = old.pages.some(page => page.some(m => m.id === message.id));
        if (alreadyExists) return old;

        return {
          ...old,
          pages: [
            [message, ...old.pages[0]],
            ...old.pages.slice(1)
          ],
          pageParams: old.pageParams
        };
      });

      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };

    const handleMessagesRead = (data: { messageIds: string[] }) => {
      queryClient.setQueryData<InfiniteData<ChatMessage[]>>(['chat', 'messages', employeeId], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map(msg =>
              data.messageIds.includes(msg.id) ? { ...msg, readAt: new Date().toISOString() } : msg
            )
          )
        };
      });
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
    };

    const handleError = (error: unknown) => {
      console.error('Socket error:', error);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('error', handleError);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('error', handleError);
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    };
  }, [socket, employeeId, queryClient]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 1. Initial scroll to bottom when data first arrives
  useEffect(() => {
    if (!isLoading && messages.length > 0 && !hasInitialScrolled.current) {
      scrollToBottom('auto');
      hasInitialScrolled.current = true;
    }
  }, [isLoading, messages.length, scrollToBottom]);

  // 2. Handle new messages arriving at the bottom
  useEffect(() => {
    if (hasInitialScrolled.current && lastMessageId) {
      const scrollArea = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        // Only scroll if user is already near the bottom (within 150px)
        const isNearBottom = 
          scrollArea.scrollHeight - scrollArea.scrollTop <= scrollArea.clientHeight + 150;
        
        if (isNearBottom) {
          scrollToBottom('smooth');
        }
      }
    }
  }, [lastMessageId, scrollToBottom]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socket || !isConnected || !employeeId) return;

    socket.emit('send_message', {
      content: inputText.trim(),
    });

    setInputText('');
  };

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden relative">
      <div className="bg-white px-4 py-3 border-b border-gray-200 shadow-sm flex-none">
        <h1 className="text-lg font-semibold text-gray-900">{t('chat.title', 'Admin Support')}</h1>
        <div className="flex items-center gap-1.5">
          <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
          <span className="text-xs text-gray-500">
            {isConnected ? t('chat.connected', 'Online') : t('chat.disconnected', 'Disconnected')}
          </span>
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="flex flex-col space-y-4 p-4 pb-24">
          <div ref={observerTarget} className="h-4 w-full flex items-center justify-center">
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {messages.map((message) => (
            <ChatMessageItem 
              key={message.id} 
              message={message} 
              onVisible={queueMarkRead}
              t={t}
            />
          ))}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </ScrollArea>

      <div className="absolute bottom-4 left-4 right-4 z-10">
        <form
          onSubmit={handleSendMessage}
          className="flex gap-2 bg-white p-2 rounded-full shadow-xl border border-gray-100"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t('chat.placeholder', 'Type a message...')}
            className="flex-1 px-4 py-2 bg-transparent border-none text-sm focus:ring-0 outline-none"
          />
          <Button
            type="submit"
            disabled={!inputText.trim() || !isConnected}
            size="icon"
            className="rounded-full h-10 w-10 shrink-0 bg-blue-600 hover:bg-blue-700 shadow-md transition-all active:scale-95"
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function ChatMessageItem({ 
  message, 
  onVisible,
  t
}: { 
  message: ChatMessage; 
  onVisible: (id: string) => void;
  t: TFunction<"translation", undefined>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMe = message.sender === 'guard';

  useEffect(() => {
    // Only observe admin messages that aren't read yet
    if (isMe || message.readAt) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(message.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [message.id, isMe, message.readAt, onVisible]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col max-w-[80%]",
        isMe ? "self-end items-end" : "self-start items-start"
      )}
    >
      {!isMe && (
        <span className="text-[10px] text-gray-500 mb-1 ml-1 font-medium">
          {message.admin?.name || 'Admin'}
        </span>
      )}
      <div
        className={cn(
          "px-4 py-2.5 rounded-2xl text-sm shadow-sm",
          isMe
            ? "bg-blue-600 text-white rounded-tr-none"
            : "bg-white text-gray-900 border border-gray-100 rounded-tl-none"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      <div className="flex items-center mt-1 gap-1 px-1">
        <span className="text-[10px] text-gray-400">
          {format(new Date(message.createdAt), 'HH:mm')}
        </span>
        {isMe && message.readAt && (
          <span className="text-[10px] text-blue-500 font-medium">{t('chat.read', 'Read')}</span>
        )}
      </div>
    </div>
  );
}
