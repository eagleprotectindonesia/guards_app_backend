'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChatInboxItem } from '@repo/types';
import { useAdminChat } from '@/hooks/use-admin-chat';
import { useAdminGroupChat } from '@/hooks/use-admin-group-chat';
import { ConversationSelection, isSameConversation } from '@/lib/chat/conversation-selection';
import { AdminChatLaunchPayload } from '@/hooks/use-admin-chat';

type UnifiedInboxView = 'inbox' | 'unread' | 'archived';
type UnifiedKindFilter = 'all' | 'direct' | 'group';
type StartChatCandidate = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

type UseAdminUnifiedChatInboxOptions = Parameters<typeof useAdminChat>[0] & {
  currentAdminId?: string | null;
};

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

export function useAdminUnifiedChatInbox(options: UseAdminUnifiedChatInboxOptions) {
  const directChat = useAdminChat(options);
  const groupChat = useAdminGroupChat({ currentAdminId: options.currentAdminId, isChatVisible: options.isChatVisible });
  const [kindFilter, setKindFilter] = useState<UnifiedKindFilter>('all');

  const filteredGroupItems = useMemo(() => {
    return groupChat.inboxItems.filter(item => {
      if (!matchesSearch(item, directChat.searchTerm)) return false;
      if (directChat.activeView === 'unread') return item.unreadCount > 0;
      if (directChat.activeView === 'archived') return item.isArchived;
      return !item.isArchived;
    });
  }, [groupChat.inboxItems, directChat.searchTerm, directChat.activeView]);

  const items = useMemo<ChatInboxItem[]>(() => {
    const merged = [...directChat.inboxItems, ...filteredGroupItems];
    const byKind = kindFilter === 'all' ? merged : merged.filter(item => item.kind === kindFilter);
    return byKind.sort((a, b) => {
      const diff = toTimestamp(b) - toTimestamp(a);
      if (diff !== 0) return diff;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.id.localeCompare(b.id);
    });
  }, [directChat.inboxItems, filteredGroupItems, kindFilter]);

  const startChatCandidates = useMemo<StartChatCandidate[]>(() => {
    const trimmedSearch = directChat.searchTerm.trim().toLowerCase();
    if (!trimmedSearch) return [];
    if (directChat.activeView !== 'inbox') return [];
    if (kindFilter === 'group') return [];
    if (items.length > 0) return [];

    const directConversationIds = new Set(directChat.inboxItems.map(item => item.id));
    return groupChat.employeeDirectory.filter(employee => {
      if (directConversationIds.has(employee.id)) return false;
      return (
        employee.fullName.toLowerCase().includes(trimmedSearch) ||
        (employee.employeeNumber ?? '').toLowerCase().includes(trimmedSearch)
      );
    });
  }, [directChat.searchTerm, directChat.activeView, kindFilter, items.length, directChat.inboxItems, groupChat.employeeDirectory]);

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
      if (isSameConversation(selectedConversation, selection)) {
        return;
      }

      if (!selection) {
        directChat.handleSelectConversation(null);
        groupChat.setActiveGroupId(null);
        return;
      }

      if (selection.kind === 'direct') {
        groupChat.setActiveGroupId(null);
        const employee = startChatCandidates.find(candidate => candidate.id === selection.id);
        if (employee) {
          void directChat.openConversationFromLaunch({
            employeeId: employee.id,
            employeeName: employee.fullName,
            employeeNumber: employee.employeeNumber,
          });
          return;
        }
        void directChat.handleSelectConversation(selection.id, false);
        return;
      }

      directChat.handleSelectConversation(null, true);
      groupChat.setActiveGroupId(selection.id);
      void groupChat.markGroupAsReadOptimistic(selection.id);
    },
    [directChat, groupChat, selectedConversation, startChatCandidates]
  );

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
    kindFilter,
    searchTerm: directChat.searchTerm,
    isLoading: directChat.isConversationsLoading || groupChat.isGroupsLoading,
    isFetchingMore: directChat.isFetchingNextConversationPage || groupChat.isFetchingNextGroups,
    hasMore: Boolean(directChat.hasNextConversationPage || groupChat.hasNextGroups),
    startChatCandidates,
    setSearchTerm,
    setActiveView,
    setKindFilter,
    selectConversation,
    loadMore,
    archiveItem,
    unarchiveItem,
    openDirectConversationFromEmployee: (employee: AdminChatLaunchPayload) =>
      directChat.openConversationFromLaunch(employee),
    directChat,
    groupChat,
  };
}
