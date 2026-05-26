'use client';

import { useCallback, useState } from 'react';
import { ChatInboxItem } from '@repo/types';
import { useAdminChat } from '@/hooks/use-admin-chat';
import { useAdminGroupChat } from '@/hooks/use-admin-group-chat';
import { AdminChatLaunchPayload } from '@/hooks/use-admin-chat';
import { useUnifiedChatItems } from '@/hooks/admin-unified-chat/use-unified-chat-items';
import { useUnifiedChatSelection } from '@/hooks/admin-unified-chat/use-unified-chat-selection';

type UnifiedInboxView = 'inbox' | 'unread' | 'archived';
type UnifiedKindFilter = 'all' | 'direct' | 'group';
type UseAdminUnifiedChatInboxOptions = Parameters<typeof useAdminChat>[0] & {
  currentAdminId?: string | null;
};

export function useAdminUnifiedChatInbox(options: UseAdminUnifiedChatInboxOptions) {
  const directChat = useAdminChat(options);
  const groupChat = useAdminGroupChat({ currentAdminId: options.currentAdminId, isChatVisible: options.isChatVisible });
  const [kindFilter, setKindFilter] = useState<UnifiedKindFilter>('all');

  const { items, startChatCandidates } = useUnifiedChatItems({
    directInboxItems: directChat.inboxItems,
    groupInboxItems: groupChat.inboxItems,
    employeeDirectory: groupChat.employeeDirectory,
    searchTerm: directChat.searchTerm,
    activeView: directChat.activeView as UnifiedInboxView,
    kindFilter,
  });

  const { selectedConversation, selectConversation } = useUnifiedChatSelection({
    activeGroupId: groupChat.activeGroupId,
    activeEmployeeId: directChat.activeEmployeeId,
    startChatCandidates,
    selectDirectConversation: directChat.handleSelectConversation,
    openDirectConversationFromLaunch: directChat.openConversationFromLaunch,
    selectGroupConversation: groupChat.setActiveGroupId,
    markGroupAsReadOptimistic: groupChat.markGroupAsReadOptimistic,
  });

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
