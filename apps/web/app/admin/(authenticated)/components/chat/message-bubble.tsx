'use client';

import React from 'react';
import { format } from 'date-fns';
import { cn, isVideoFile } from '@/lib/utils';
import { ChatMessage } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isAdmin: boolean;
  className?: string;
}

export function ChatMessageBubble({ message, isAdmin, className }: ChatMessageBubbleProps) {
  return (
    <div
      className={cn(
        'flex flex-col max-w-[85%] md:max-w-[75%]',
        isAdmin ? 'ml-auto items-end' : 'mr-auto items-start',
        className
      )}
    >
      <div
        className={cn(
          'p-3 px-4 rounded-2xl text-sm shadow-sm',
          isAdmin
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-card border border-border text-foreground rounded-tl-none'
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div
            className={cn(
              'grid gap-2 mb-3',
              message.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            )}
          >
            {message.attachments.map((url, i) => {
              if (isVideoFile(url)) {
                return (
                  <video
                    key={i}
                    src={url}
                    controls
                    className="w-full h-auto max-h-[300px] object-contain rounded-lg bg-black/5"
                  />
                );
              }
              return (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="w-full max-h-[300px] object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(url, '_blank')}
                />
              );
            })}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      <div className="flex items-center gap-1.5 px-1 mt-1.5">
        <span className="text-[10px] text-muted-foreground/60">
          {format(new Date(message.createdAt), 'HH:mm')}
        </span>
        {isAdmin && (
          <span
            className={cn(
              'text-[10px]',
              message.readAt ? 'text-blue-500' : 'text-muted-foreground/40'
            )}
          >
            {message.readAt ? 'Read' : 'Sent'}
          </span>
        )}
      </div>
    </div>
  );
}
