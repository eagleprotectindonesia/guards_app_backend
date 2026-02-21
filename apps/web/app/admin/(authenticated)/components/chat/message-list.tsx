'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { ChatMessage } from '@/types/chat';
import { MessageSquare, Loader2 } from 'lucide-react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ChatMessageBubble } from './message-bubble';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  currentAdminId?: string | null;
  typingEmployeeName?: string;
  className?: string;
}

export function ChatMessageList({
  messages,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  currentAdminId,
  typingEmployeeName,
  className,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);
  const lastScrollHeight = useRef(0);
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // 1. Initial scroll to bottom when data arrives
  useEffect(() => {
    if (!isLoading && messages.length > 0 && !hasInitialScrolled.current) {
      scrollToBottom('auto');
      hasInitialScrolled.current = true;
    }
    // Also reset if activeEmployeeId changes (not directly available here but messages will change)
  }, [isLoading, messages.length, scrollToBottom]);

  // Reset initial scroll flag if messages are empty (likely new conversation selected)
  useEffect(() => {
    if (messages.length === 0) {
      hasInitialScrolled.current = false;
    }
  }, [messages.length]);

  // 2. Handle scroll maintenance when loading previous pages
  useEffect(() => {
    if (isFetchingNextPage) {
      lastScrollHeight.current = scrollRef.current?.scrollHeight || 0;
    } else if (lastScrollHeight.current > 0 && scrollRef.current) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      const heightDifference = newScrollHeight - lastScrollHeight.current;
      if (heightDifference > 0) {
        scrollRef.current.scrollTop += heightDifference;
      }
      lastScrollHeight.current = 0;
    }
  }, [isFetchingNextPage]);

  // 3. Handle new messages appearing at the bottom
  useEffect(() => {
    if (hasInitialScrolled.current && lastMessageId) {
      const scrollArea = scrollRef.current;
      if (scrollArea) {
        // Only scroll if user is already near bottom (within 150px)
        const isNearBottom = scrollArea.scrollHeight - scrollArea.scrollTop <= scrollArea.clientHeight + 150;
        if (isNearBottom) {
          scrollToBottom('smooth');
        }
      }
    }
  }, [lastMessageId, scrollToBottom]);

  // 4. Typing indicator scroll
  useEffect(() => {
    if (typingEmployeeName && scrollRef.current) {
      const scrollArea = scrollRef.current;
      const isNearBottom = scrollArea.scrollHeight - scrollArea.scrollTop <= scrollArea.clientHeight + 100;
      if (isNearBottom) {
        scrollToBottom('smooth');
      }
    }
  }, [typingEmployeeName, scrollToBottom]);

  // 5. Infinite Scroll Observer
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !fetchNextPage) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const target = observerTarget.current;
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 bg-muted/5">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground bg-muted/5">
        <MessageSquare size={48} className="mb-4 opacity-10" />
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className={className} ref={scrollRef}>
      <div className="p-6 space-y-4">
        {/* Infinite scroll target */}
        <div ref={observerTarget} className="h-4 w-full flex items-center justify-center">
          {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        </div>

        {(() => {
          const groups: { date: Date; label: string; items: ChatMessage[] }[] = [];

          messages.forEach(msg => {
            const msgDate = new Date(msg.createdAt);
            const lastGroup = groups[groups.length - 1];

            if (!lastGroup || !isSameDay(lastGroup.date, msgDate)) {
              let dateLabel = format(msgDate, 'MMMM d, yyyy');
              if (isToday(msgDate)) dateLabel = 'Today';
              else if (isYesterday(msgDate)) dateLabel = 'Yesterday';

              groups.push({ date: msgDate, label: dateLabel, items: [msg] });
            } else {
              lastGroup.items.push(msg);
            }
          });

          return groups.map(group => (
            <div key={group.date.toISOString()} className="flex flex-col gap-4 relative">
              <div className="flex justify-center my-4 sticky top-2 z-10 py-1">
                <span className="px-3 py-1 bg-muted/80 backdrop-blur-sm rounded-full text-[11px] font-medium text-muted-foreground border shadow-sm">
                  {group.label}
                </span>
              </div>
              {group.items.map(current => (
                <ChatMessageBubble
                  key={current.id}
                  message={current}
                  isAdmin={current.sender === 'admin'}
                  currentAdminId={currentAdminId}
                />
              ))}
            </div>
          ));
        })()}

        {typingEmployeeName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse ml-1">
            <span className="font-medium">{typingEmployeeName} is typing...</span>
          </div>
        )}

        {/* Scroll to bottom anchor */}
        <div ref={messagesEndRef} className="h-1" />
      </div>
    </div>
  );
}
