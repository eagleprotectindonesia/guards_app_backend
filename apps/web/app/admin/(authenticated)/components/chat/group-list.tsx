'use client';

import React from 'react';
import { Users, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@repo/shared';

interface GroupListItem {
  participant: { id: string; role: string; unreadCount: number };
  group: {
    id: string;
    title: string;
    description?: string | null;
    lastMessageAt?: string | null;
    lastMessageSenderName?: string | null;
    lastMessageContent?: string | null;
  };
}

interface GroupListProps {
  groups: GroupListItem[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  className?: string;
  onCreateGroup?: () => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

export function GroupList({
  groups,
  activeGroupId,
  onSelect,
  searchTerm,
  onSearchChange,
  className,
  onCreateGroup,
  isLoading,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: GroupListProps) {
  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      <div className="p-4 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Groups</h2>
          {onCreateGroup && (
            <button
              onClick={onCreateGroup}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
              title="Create New Group"
            >
              <Users size={18} />
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search groups..."
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
        {isLoading ? (
          <div className="flex flex-col items-center justify-center mt-20 text-muted-foreground">
            <Loader2 className="animate-spin mb-2" size={24} />
            <p className="text-sm">Loading groups...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center text-muted-foreground mt-20 text-sm px-6">
            {searchTerm ? 'No groups found' : 'No group chats yet'}
          </div>
        ) : (
          <>
            {groups.map(item => (
              <div
                key={item.group.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item.group.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(item.group.id);
                  }
                }}
                className={cn(
                  'w-full text-left p-4 border-b border-border/50 hover:bg-muted/50 transition-all flex items-center gap-4 relative cursor-pointer',
                  activeGroupId === item.group.id &&
                    'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500'
                )}
              >
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0">
                  <Users className="text-blue-600 dark:text-blue-400" size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <p className="font-semibold text-foreground truncate flex-1 min-w-0">
                      {item.group.title}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.group.lastMessageSenderName ? (
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {item.group.lastMessageSenderName}:{' '}
                      </span>
                    ) : null}
                    {item.group.lastMessageContent || <span className="italic">No messages yet</span>}
                  </p>
                </div>
                {item.participant.unreadCount > 0 && (
                  <div className="min-w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1.5 ml-2">
                    {item.participant.unreadCount}
                  </div>
                )}
              </div>
            ))}

            {hasMore && (
              <div className="p-3 flex justify-center border-t border-border/50">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-full transition-all disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      Loading more
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
