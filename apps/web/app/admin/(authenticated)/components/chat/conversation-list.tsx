'use client';

import React, { useMemo } from 'react';
import { ArchiveRestore, ArchiveX, Search, User, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types/chat';
import ChatExport from './chat-export';

interface ConversationListProps {
  conversations: Conversation[];
  activeEmployeeId: string | null;
  currentAdminId?: string | null;
  onSelect: (employeeId: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  activeView?: 'inbox' | 'unread' | 'archived';
  onViewChange?: (view: 'inbox' | 'unread' | 'archived') => void;
  typingEmployees?: Record<string, boolean>;
  className?: string;
  itemClassName?: string;
  showExportButton?: boolean;
  onArchive?: (employeeId: string) => void;
  onUnarchive?: (employeeId: string) => void;
}

export function ConversationList({
  conversations,
  activeEmployeeId,
  currentAdminId,
  onSelect,
  searchTerm,
  onSearchChange,
  activeView = 'inbox',
  onViewChange,
  typingEmployees = {},
  className,
  itemClassName,
  showExportButton = true,
  onArchive,
  onUnarchive,
}: ConversationListProps) {
  const exportEmployees = useMemo(
    () => conversations.map(c => ({ id: c.employeeId, fullName: c.employeeName })),
    [conversations]
  );

  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      <div className="p-4 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Messages</h2>
          {showExportButton && <ChatExport activeEmployeeId={activeEmployeeId} employees={exportEmployees} />}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => onViewChange?.('inbox')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all',
              activeView === 'inbox' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Inbox
          </button>
          <button
            onClick={() => onViewChange?.('unread')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all flex items-center gap-1.5',
              activeView === 'unread' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Unread
          </button>
          <button
            onClick={() => onViewChange?.('archived')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all',
              activeView === 'archived' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Archived
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search by name or employee number..."
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="text-center text-muted-foreground mt-20 text-sm px-6">
            {searchTerm ? 'No employees found' : 'No conversations yet'}
          </div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.employeeId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(conv.employeeId)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(conv.employeeId);
                }
              }}
              className={cn(
                'w-full text-left p-4 border-b border-border/50 hover:bg-muted/50 transition-all flex items-center gap-4 relative',
                activeEmployeeId === conv.employeeId &&
                  'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500',
                itemClassName
              )}
            >
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center shrink-0 relative">
                <User className="text-muted-foreground" size={24} />
                {typingEmployees[conv.employeeId] && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-card rounded-full animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-foreground truncate">
                    {conv.employeeName}{' '}
                    <span className="text-xs font-normal text-muted-foreground">({conv.employeeNumber})</span>
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {format(new Date(conv.lastMessage.createdAt), 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {typingEmployees[conv.employeeId] ? (
                    <span className="text-green-600 dark:text-green-400 font-medium italic">typing...</span>
                  ) : conv.isDraft ? (
                    <span className="italic">No messages yet</span>
                  ) : (
                    <>
                      {conv.lastMessage.sender === 'admin' ? (
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {conv.lastMessage.sender === 'admin' && conv.lastMessage.adminName === undefined
                            ? 'You'
                            : currentAdminId && conv.lastMessage.adminId === currentAdminId
                              ? 'You'
                              : conv.lastMessage.adminName || 'Admin'}
                          :{' '}
                        </span>
                      ) : null}
                      {conv.lastMessage.content}
                    </>
                  )}
                </p>
              </div>
              {conv.unreadCount > 0 && (
                <div className="min-w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1.5 ml-2">
                  {conv.unreadCount}
                </div>
              )}
              {conv.isDraft ? null : conv.isArchived ? (
                <button
                  type="button"
                  aria-label="Unarchive conversation"
                  title="Unarchive conversation"
                  onClick={event => {
                    event.stopPropagation();
                    onUnarchive?.(conv.employeeId);
                  }}
                  className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveRestore size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Archive conversation"
                  title="Archive conversation"
                  onClick={event => {
                    event.stopPropagation();
                    onArchive?.(conv.employeeId);
                  }}
                  className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveX size={16} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
