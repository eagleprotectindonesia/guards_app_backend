'use client';

import { format, isToday } from 'date-fns';
import { ArchiveRestore, ArchiveX, Download, Loader2, MessageSquarePlus, Search, Users, X } from 'lucide-react';
import { ChatInboxItem } from '@repo/types';
import { cn } from '@repo/shared';
import { ConversationSelection } from '@/lib/chat/conversation-selection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type StartChatCandidate = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

type UnifiedConversationListProps = {
  items: ChatInboxItem[];
  startChatCandidates?: StartChatCandidate[];
  selectedConversation: ConversationSelection;
  activeView: 'inbox' | 'unread' | 'archived';
  kindFilter: 'all' | 'direct' | 'group';
  searchTerm: string;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onSelect: (selection: Exclude<ConversationSelection, null>) => void;
  onStartChat?: (employeeId: string) => void;
  onSearchChange: (value: string) => void;
  onViewChange: (view: 'inbox' | 'unread' | 'archived') => void;
  onKindFilterChange: (kind: 'all' | 'direct' | 'group') => void;
  onLoadMore?: () => void;
  onArchive?: (item: ChatInboxItem) => void;
  onUnarchive?: (item: ChatInboxItem) => void;
  onCreateGroup?: () => void;
  onCreateDirect?: () => void;
  onExport?: () => void;
  showCreateGroupButton?: boolean;
  showExportButton?: boolean;
  isExportDisabled?: boolean;
  exportDisabledReason?: string;
  className?: string;
  isWidget?: boolean;
};

export function UnifiedConversationList({
  items,
  startChatCandidates = [],
  selectedConversation,
  activeView,
  kindFilter,
  searchTerm,
  isLoading,
  hasMore,
  isLoadingMore,
  onSelect,
  onStartChat,
  onSearchChange,
  onViewChange,
  onKindFilterChange,
  onLoadMore,
  onArchive,
  onUnarchive,
  onCreateGroup,
  onCreateDirect,
  onExport,
  showCreateGroupButton = true,
  showExportButton = true,
  isExportDisabled,
  exportDisabledReason,
  className,
  isWidget = false,
}: UnifiedConversationListProps) {
  const views = isWidget
    ? (['inbox', 'unread'] as const)
    : (['inbox', 'unread', 'archived'] as const);

  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      <div className={cn('p-4 border-b border-border bg-muted/10', isWidget && 'p-3')}>
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className={cn('text-lg font-semibold', isWidget && 'text-base')}>Messages</h2>
          <div className="flex items-center gap-2">
            {showCreateGroupButton && (
              <button
                type="button"
                onClick={onCreateGroup}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                title="Create group"
              >
                <Users size={18} />
              </button>
            )}
            {!isWidget && (
              <button
                type="button"
                onClick={onCreateDirect}
                className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                title="Start new conversation"
              >
                <MessageSquarePlus size={18} />
              </button>
            )}
            {showExportButton && (
              <button
                type="button"
                onClick={onExport}
                disabled={isExportDisabled}
                title={isExportDisabled ? exportDisabledReason : 'Download chat history'}
                className="inline-flex items-center justify-center h-9 px-3 py-2 bg-card border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Download History
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
            {views.map(view => (
              <button
                key={view}
                onClick={() => onViewChange(view)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all',
                  activeView === view
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/80'
                )}
              >
                {view[0].toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>

          {!isWidget && (
            <Select
              value={kindFilter}
              onValueChange={val => onKindFilterChange(val as 'all' | 'direct' | 'group')}
            >
              <SelectTrigger size="sm" className="w-[110px] h-8 bg-background border-border/50">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="group">Group</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search conversations..."
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
            <p className="text-sm">Loading conversations...</p>
          </div>
        ) : items.length === 0 && startChatCandidates.length === 0 ? (
          <div className="text-center text-muted-foreground mt-20 text-sm px-6">
            {searchTerm ? 'No conversations found' : 'No conversations yet'}
          </div>
        ) : (
          <>
            {items.map(item => {
              const isSelected =
                selectedConversation?.kind === item.kind && selectedConversation?.id === item.id;
              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect({ kind: item.kind, id: item.id })}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect({ kind: item.kind, id: item.id });
                    }
                  }}
                  className={cn(
                    'w-full text-left p-4 border-b border-border/50 hover:bg-muted/50 transition-all flex items-center gap-3 relative cursor-pointer',
                    isWidget && 'p-3 gap-2',
                    isSelected && 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500'
                  )}
                >
                  {item.kind === 'group' ? (
                    <div className={cn('w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0', isWidget && 'w-10 h-10')}>
                      <Users className="text-blue-600 dark:text-blue-400" size={isWidget ? 20 : 24} />
                    </div>
                  ) : (
                    <div className={cn('w-12 h-12 bg-muted rounded-full flex items-center justify-center shrink-0', isWidget && 'w-10 h-10')} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5 gap-2">
                      <p className={cn('font-semibold text-foreground truncate flex-1 min-w-0 leading-tight', isWidget && 'text-sm')}>
                        {item.title}
                        {item.kind === 'direct' && item.subtitle ? (
                          <span className="text-[10px] font-normal text-muted-foreground block md:inline md:text-xs"> ({item.subtitle})</span>
                        ) : null}
                      </p>
                      {item.lastMessage?.createdAt && (
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                          {(() => {
                            const date = new Date(item.lastMessage.createdAt);
                            if (isWidget) {
                              return isToday(date) ? format(date, 'HH:mm') : format(date, 'MMM d');
                            }
                            return format(date, 'MMM d, HH:mm');
                          })()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate leading-normal">
                      {item.kind === 'group'
                        ? item.subtitle ||
                          (item.lastMessage
                            ? `${item.lastMessage.senderName}: ${item.lastMessage.content}`
                            : null) ||
                          'No group messages yet'
                        : (item.lastMessage
                            ? `${item.lastMessage.senderName}: ${item.lastMessage.content}`
                            : null) || 'No messages yet'}
                    </p>
                  </div>
                  {item.unreadCount > 0 && (
                    <div className="min-w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1.5 ml-1">
                      {item.unreadCount}
                    </div>
                  )}
                  {!isWidget && (
                    <>
                      {item.isArchived ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onUnarchive?.(item);
                          }}
                          className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          <ArchiveRestore size={16} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onArchive?.(item);
                          }}
                          className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          <ArchiveX size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {items.length === 0 && startChatCandidates.map(employee => {
              const isSelected = selectedConversation?.kind === 'direct' && selectedConversation?.id === employee.id;
              return (
                <div
                  key={`start-chat:${employee.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onStartChat?.(employee.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onStartChat?.(employee.id);
                    }
                  }}
                  className={cn(
                    'w-full text-left p-4 border-b border-border/50 hover:bg-muted/50 transition-all flex items-center gap-4 relative cursor-pointer',
                    isSelected && 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500'
                  )}
                >
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <p className="font-semibold text-foreground truncate flex-1 min-w-0">{employee.fullName}</p>
                      <span className="text-[10px] uppercase tracking-wide text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full shrink-0">
                        start-chat
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {employee.employeeNumber || 'No employee number'}
                    </p>
                  </div>
                </div>
              );
            })}

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
