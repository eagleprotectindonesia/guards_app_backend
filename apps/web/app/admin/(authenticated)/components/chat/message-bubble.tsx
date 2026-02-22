'use client';

import React from 'react';
import { format } from 'date-fns';
import { MapPin } from 'lucide-react';
import { cn, isVideoFile } from '@/lib/utils';
import { ChatMessage } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isAdmin: boolean;
  currentAdminId?: string | null;
  className?: string;
}

export function ChatMessageBubble({ message, isAdmin, currentAdminId, className }: ChatMessageBubbleProps) {
  const isMe = isAdmin && currentAdminId === message.adminId;

  return (
    <div
      className={cn(
        'flex flex-col max-w-[85%] md:max-w-[75%]',
        isAdmin ? 'ml-auto items-end' : 'mr-auto items-start',
        className
      )}
    >
      {isAdmin && (message.admin?.name || isMe) && (
        <span className="text-[10px] font-medium text-muted-foreground mb-1 px-1">
          {isMe ? 'You' : message.admin?.name}
        </span>
      )}
      <div
        className={cn(
          'p-3 px-4 rounded-2xl text-sm shadow-sm',
          isAdmin
            ? 'bg-blue-600 text-white rounded-tr-none'
            : 'bg-card border border-border text-foreground rounded-tl-none'
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn('grid gap-2 mb-3', message.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
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
        {message.latitude && message.longitude && (
          <a
            href={`https://maps.google.com/?q=${message.latitude},${message.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl mb-2 border transition-all hover:opacity-90',
              isAdmin
                ? 'bg-blue-700/40 border-blue-500/50 text-white'
                : 'bg-muted border-border text-foreground hover:bg-muted/80'
            )}
          >
            <div className={cn('p-2.5 rounded-full shrink-0', isAdmin ? 'bg-blue-600' : 'bg-muted-foreground/10')}>
              <MapPin size={22} className={isAdmin ? 'text-white' : 'text-muted-foreground'} />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-[15px]">Shared Location</span>
              <span className="text-xs opacity-80 mt-0.5">Click to open map</span>
            </div>
          </a>
        )}
        {message.content ? <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p> : null}
      </div>
      <div className="flex items-center gap-1.5 px-1 mt-1.5">
        <span className="text-[10px] text-muted-foreground/60">{format(new Date(message.createdAt), 'HH:mm')}</span>
        {isAdmin && (
          <span className={cn('text-[10px]', message.readAt ? 'text-blue-500' : 'text-muted-foreground/40')}>
            {message.readAt ? 'Read' : 'Sent'}
          </span>
        )}
      </div>
    </div>
  );
}
