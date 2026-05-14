'use client';

import { useCallback, useMemo } from 'react';
import { ChatInboxItem } from '@repo/types';
import { useAdminChat } from '@/hooks/use-admin-chat';
import { useAdminGroupChat } from '@/hooks/use-admin-group-chat';
import { ConversationSelection } from '@/lib/chat/conversation-selection';

type UnifiedInboxView = 'inbox' | 'unread' | 'archived';

function toTimestamp(item: ChatInboxItem): number {
  const createdAt = item.lastMessage?.createdAt;
  if (!createdAt) return 0;
  const ms = new Date(createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function matchesSearch(item: ChatInboxItem, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.trim().toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    (item.subtitle ?? '').toLowerCase().includes(q) ||
    (item.lastMessage?.content ?? '').toLowerCase().includes(q)
  );
}

export function useAdminUnifiedChatInbox(options: Parameters<typeof useAdminChat>[0]) {
  const directChat = useAdminChat(options);
  const groupChat = useAdminGroupChat();

  const selectedConversation = useMemo<ConversationSelection>(() => {
    if (groupChat.activeGroupId) return { kind: 'group', id: groupChat.activeGroupId };
    if (directChat.activeEmployeeId) return { kind: 'direct', id: directChat.activeEmployeeId };
    return null;
  }, [directChat.activeEmployeeId, groupChat.activeGroupId]);

  const setSearchTerm = useCallback(
    (value: string) => {
      directChat.setSearchTerm(value);
      groupChat.setSearchTerm(value);
    },
    [directChat, groupChat]
  );

  const setActiveView = useCallback(
    (view: UnifiedInboxView) => {
      directChat.handleViewChange(view);
      groupChat.setActiveView(view);
    },
    [directChat, groupChat]
  );

  const selectConversation = useCallback(
    (selection: ConversationSelection) => {
      if (!selection) {
        directChat.handleSelectConversation(null);
        groupChat.setActiveGroupId(null);
        return;
      }

      if (selection.kind === 'direct') {
        groupChat.setActiveGroupId(null);
        void directChat.handleSelectConversation(selection.id);
        return;
      }

      directChat.handleSelectConversation(null);
      groupChat.setActiveGroupId(selection.id);
      void groupChat.markGroupAsReadOptimistic(selection.id);
    },
    [directChat, groupChat]
  );

  const filteredGroupItems = useMemo(() => {
    return groupChat.inboxItems.filter(item => {
      if (!matchesSearch(item, directChat.searchTerm)) return false;
      if (directChat.activeView === 'unread') return item.unreadCount > 0;
      if (directChat.activeView === 'archived') return item.isArchived;
      return !item.isArchived;
    });
  }, [groupChat.inboxItems, directChat.searchTerm, directChat.activeView]);

  const items = useMemo<ChatInboxItem[]>(() => {
    return [...directChat.inboxItems, ...filteredGroupItems].sort((a, b) => {
      const diff = toTimestamp(b) - toTimestamp(a);
      if (diff !== 0) return diff;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.id.localeCompare(b.id);
    });
  }, [directChat.inboxItems, filteredGroupItems]);

  const loadMore = useCallback(() => {
    if (directChat.hasNextConversationPage && !directChat.isFetchingNextConversationPage) {
      void directChat.fetchNextConversationPage();
    }
    if (groupChat.hasNextGroups && !groupChat.isFetchingNextGroups) {
      void groupChat.fetchNextGroups();
    }
  }, [directChat, groupChat]);

  const archiveItem = useCallback(
    async (item: ChatInboxItem) => {
      if (item.kind === 'direct') {
        await directChat.handleArchiveConversation(item.id);
        return;
      }
      await groupChat.archiveGroup(item.id);
    },
    [directChat, groupChat]
  );

  const unarchiveItem = useCallback(
    async (item: ChatInboxItem) => {
      if (item.kind === 'direct') {
        await directChat.handleUnarchiveConversation(item.id);
        return;
      }
      await groupChat.unarchiveGroup(item.id);
    },
    [directChat, groupChat]
  );

  return {
    items,
    selectedConversation,
    activeView: directChat.activeView as UnifiedInboxView,
    searchTerm: directChat.searchTerm,
    isLoading: directChat.isConversationsLoading || groupChat.isGroupsLoading,
    isFetchingMore: directChat.isFetchingNextConversationPage || groupChat.isFetchingNextGroups,
    hasMore: Boolean(directChat.hasNextConversationPage || groupChat.hasNextGroups),
    setSearchTerm,
    setActiveView,
    selectConversation,
    loadMore,
    archiveItem,
    unarchiveItem,
    directChat,
    groupChat,
  };
}
