import { useMemo } from 'react';
import { ChatInboxItem } from '@repo/types';
import { matchesSearch, toTimestamp } from '@/hooks/admin-unified-chat/unified-chat-utils';

type UnifiedInboxView = 'inbox' | 'unread' | 'archived';
type UnifiedKindFilter = 'all' | 'direct' | 'group';

export type StartChatCandidate = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

interface UseUnifiedChatItemsParams {
  directInboxItems: ChatInboxItem[];
  groupInboxItems: ChatInboxItem[];
  employeeDirectory: StartChatCandidate[];
  searchTerm: string;
  activeView: UnifiedInboxView;
  kindFilter: UnifiedKindFilter;
}

export function useUnifiedChatItems({
  directInboxItems,
  groupInboxItems,
  employeeDirectory,
  searchTerm,
  activeView,
  kindFilter,
}: UseUnifiedChatItemsParams) {
  const filteredGroupItems = useMemo(() => {
    return groupInboxItems.filter(item => {
      if (!matchesSearch(item, searchTerm)) return false;
      if (activeView === 'unread') return item.unreadCount > 0;
      if (activeView === 'archived') return item.isArchived;
      return !item.isArchived;
    });
  }, [groupInboxItems, searchTerm, activeView]);

  const items = useMemo<ChatInboxItem[]>(() => {
    const merged = [...directInboxItems, ...filteredGroupItems];
    const byKind = kindFilter === 'all' ? merged : merged.filter(item => item.kind === kindFilter);
    return byKind.sort((a, b) => {
      const diff = toTimestamp(b) - toTimestamp(a);
      if (diff !== 0) return diff;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.id.localeCompare(b.id);
    });
  }, [directInboxItems, filteredGroupItems, kindFilter]);

  const startChatCandidates = useMemo<StartChatCandidate[]>(() => {
    const trimmedSearch = searchTerm.trim().toLowerCase();
    if (!trimmedSearch) return [];
    if (activeView !== 'inbox') return [];
    if (kindFilter === 'group') return [];
    if (items.length > 0) return [];

    const directConversationIds = new Set(directInboxItems.map(item => item.id));
    return employeeDirectory.filter(employee => {
      if (directConversationIds.has(employee.id)) return false;
      return (
        employee.fullName.toLowerCase().includes(trimmedSearch) ||
        (employee.employeeNumber ?? '').toLowerCase().includes(trimmedSearch)
      );
    });
  }, [searchTerm, activeView, kindFilter, items.length, directInboxItems, employeeDirectory]);

  return {
    items,
    startChatCandidates,
  };
}
