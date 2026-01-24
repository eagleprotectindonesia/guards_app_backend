'use client';

import React from 'react';
import { Search, User, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types/chat';
import ChatExport from './chat-export';

interface ConversationListProps {
  conversations: Conversation[];
  activeEmployeeId: string | null;
  onSelect: (employeeId: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType?: 'all' | 'unread';
  onFilterChange?: (filter: 'all' | 'unread') => void;
  typingEmployees?: Record<string, boolean>;
  className?: string;
  itemClassName?: string;
  showExportButton?: boolean;
}

export function ConversationList({
  conversations,
  activeEmployeeId,
  onSelect,
  searchTerm,
  onSearchChange,
  filterType = 'all',
  onFilterChange,
  typingEmployees = {},
  className,
  itemClassName,
  showExportButton = true,
}: ConversationListProps) {
  const exportEmployees = React.useMemo(
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
            onClick={() => onFilterChange?.('all')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all',
              filterType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            All
          </button>
          <button
            onClick={() => onFilterChange?.('unread')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-all flex items-center gap-1.5',
              filterType === 'unread'
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Unread
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search by name or ID..."
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
            <button
              key={conv.employeeId}
              onClick={() => onSelect(conv.employeeId)}
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
                    <span className="text-xs font-normal text-muted-foreground">({conv.employeeId})</span>
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                    {format(new Date(conv.lastMessage.createdAt), 'MMM d, HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {typingEmployees[conv.employeeId] ? (
                    <span className="text-green-600 dark:text-green-400 font-medium italic">typing...</span>
                  ) : (
                    <>
                      {conv.lastMessage.sender === 'admin' ? 'You: ' : ''}
                      {conv.lastMessage.content}
                    </>
                  )}
                </p>
              </div>
              {conv.unreadCount > 0 && (
                <div className="min-w-[20px] h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1.5 ml-2">
                  {conv.unreadCount}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
