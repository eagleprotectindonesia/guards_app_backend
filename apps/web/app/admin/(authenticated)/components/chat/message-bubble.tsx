'use client';

import React from 'react';
import { format } from 'date-fns';
import { MapPin } from 'lucide-react';
import { cn } from '@repo/shared';
import { isVideoFile } from '@/lib/file';
import { ChatMessage } from '@/types/chat';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isAdmin: boolean;
  mode?: 'direct' | 'group';
  currentAdminId?: string | null;
  className?: string;
}

function getSenderColorClass(senderKey: string) {
  const palette = [
    'bg-emerald-50 border-emerald-200 text-emerald-950',
    'bg-amber-50 border-amber-200 text-amber-950',
    'bg-cyan-50 border-cyan-200 text-cyan-950',
    'bg-rose-50 border-rose-200 text-rose-950',
    'bg-lime-50 border-lime-200 text-lime-950',
    'bg-sky-50 border-sky-200 text-sky-950',
  ] as const;

  let hash = 0;
  for (let i = 0; i < senderKey.length; i += 1) {
    hash = (hash * 31 + senderKey.charCodeAt(i)) >>> 0;
  }

  return palette[hash % palette.length];
}

export function ChatMessageBubble({ message, isAdmin, mode = 'direct', currentAdminId, className }: ChatMessageBubbleProps) {
  const isMe = isAdmin && currentAdminId === message.adminId;
  const senderType = message.sender ?? (message.adminId ? 'admin' : 'employee');
  const senderRoleLabel = senderType === 'admin' ? 'Admin' : 'Employee';
  const senderDisplayName = message.admin?.name || (message as ChatMessage & { senderName?: string }).senderName || 'Unknown';
  const senderKey =
    message.adminId ||
    (message as ChatMessage & { employeeId?: string | null; senderParticipantId?: string }).employeeId ||
    (message as ChatMessage & { senderParticipantId?: string }).senderParticipantId ||
    senderDisplayName;
  const showGroupSenderLabel = mode === 'group' && !isMe;
  const bubbleClass = isAdmin
    ? 'bg-blue-600 text-white rounded-tr-none'
    : mode === 'group'
      ? `${getSenderColorClass(senderKey)} rounded-tl-none`
      : 'bg-card border border-border text-foreground rounded-tl-none';

  return (
    <div
      className={cn(
        'flex flex-col max-w-[85%] md:max-w-[75%]',
        isAdmin ? 'ml-auto items-end' : 'mr-auto items-start',
        className
      )}
    >
      {showGroupSenderLabel && (
        <span className="text-[10px] font-medium text-muted-foreground mb-1 px-1">
          {senderDisplayName} · {senderRoleLabel}
        </span>
      )}
      {isAdmin && (message.admin?.name || isMe) && (
        <span className="text-[10px] font-medium text-muted-foreground mb-1 px-1">
          {isMe ? 'You' : message.admin?.name}
        </span>
      )}
      <div
        className={cn(
          'p-3 px-4 rounded-2xl text-sm shadow-sm',
          bubbleClass
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
