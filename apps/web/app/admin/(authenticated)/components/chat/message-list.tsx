'use client';

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '@/types/chat';
import { ChatMessageBubble } from './message-bubble';
import { MessageSquare, Loader2 } from 'lucide-react';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  typingEmployeeName?: string;
  className?: string;
}

export function ChatMessageList({ messages, isLoading, typingEmployeeName, className }: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingEmployeeName]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <MessageSquare size={48} className="mb-4 opacity-10" />
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className={className} ref={scrollRef}>
      <div className="p-6 space-y-4">
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            isAdmin={msg.sender === 'admin'}
          />
        ))}
        {typingEmployeeName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse ml-1">
            <span className="font-medium">{typingEmployeeName} is typing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
