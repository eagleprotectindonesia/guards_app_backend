'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminChatLaunchPayload } from '@/hooks/use-admin-chat';
import { Conversation } from '@/types/chat';
import { buildDraftConversation } from '@/hooks/admin-chat/admin-chat-utils';

type ConversationView = 'inbox' | 'unread' | 'archived';

interface UseAdminChatSelectionParams {
  initialEmployeeId?: string | null;
  initialDraft?: AdminChatLaunchPayload | null;
  onSelectConversation?: (employeeId: string | null, draft?: AdminChatLaunchPayload | null) => void;
  activeEmployeeId: string | null;
  setActiveEmployeeId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveView: React.Dispatch<React.SetStateAction<ConversationView>>;
  draftConversation: Conversation | null;
  setDraftConversation: React.Dispatch<React.SetStateAction<Conversation | null>>;
  setArchivedEmployeeIds: React.Dispatch<React.SetStateAction<string[]>>;
  updateConversationInCache: (employeeId: string, updater: (conv: Conversation) => Conversation) => void;
}

export function useAdminChatSelection({
  initialEmployeeId,
  initialDraft,
  onSelectConversation,
  activeEmployeeId,
  setActiveEmployeeId,
  setActiveView,
  draftConversation,
  setDraftConversation,
  setArchivedEmployeeIds,
  updateConversationInCache,
}: UseAdminChatSelectionParams) {
  const [isInitialSelectionReady, setIsInitialSelectionReady] = useState(!initialEmployeeId);
  const [canRestoreInitialSelection, setCanRestoreInitialSelection] = useState(!initialEmployeeId);

  const initialEmployeeIdRef = useRef(initialEmployeeId ?? null);
  const initialDraftRef = useRef(initialDraft?.employeeId === initialEmployeeId ? initialDraft : null);
  const hasBootstrappedInitialSelectionRef = useRef(false);

  const initialDraftConversation = useMemo(
    () => (initialDraft ? buildDraftConversation(initialDraft) : null),
    [initialDraft]
  );

  const visibleDraftConversation = draftConversation ?? initialDraftConversation;

  const handleSelectConversation = useCallback(
    async (employeeId: string | null, skipCallback = false, draft?: AdminChatLaunchPayload | null) => {
      setActiveEmployeeId(employeeId);

      if (!skipCallback && onSelectConversation) {
        onSelectConversation(employeeId, draft || null);
      }

      if (!employeeId) return;

      if (draft) {
        setDraftConversation(buildDraftConversation(draft));
      }

      updateConversationInCache(employeeId, conv => ({ ...conv, unreadCount: 0 }));
    },
    [onSelectConversation, setActiveEmployeeId, setDraftConversation, updateConversationInCache]
  );

  const handleViewChange = useCallback(
    (view: ConversationView) => {
      setActiveView(view);
      void handleSelectConversation(null);
    },
    [handleSelectConversation, setActiveView]
  );

  useEffect(() => {
    if (hasBootstrappedInitialSelectionRef.current) {
      return;
    }

    hasBootstrappedInitialSelectionRef.current = true;
    let cancelled = false;

    const restoreInitialConversation = async () => {
      const initialEmployee = initialEmployeeIdRef.current;
      const initialDraftPayload = initialDraftRef.current;

      if (!initialEmployee) {
        setCanRestoreInitialSelection(false);
        setIsInitialSelectionReady(true);
        return;
      }

      if (initialDraftPayload) {
        setActiveView('inbox');
        setCanRestoreInitialSelection(true);
        if (!cancelled) {
          setIsInitialSelectionReady(true);
        }
        return;
      }

      try {
        const url = new URL('/api/shared/chat/conversations', window.location.origin);
        url.searchParams.set('view', 'archived');
        url.searchParams.set('limit', '200');
        const res = await fetch(url.toString());
        if (cancelled) return;

        const archivedData = res.ok
          ? ((await res.json()) as { conversations: Conversation[]; nextCursor: string | null })
          : { conversations: [], nextCursor: null };

        const archivedEmployees = archivedData.conversations.map(c => c.employeeId);
        const isArchived = archivedEmployees.includes(initialEmployee);
        const targetView: ConversationView = isArchived ? 'archived' : 'inbox';

        if (cancelled) return;
        setArchivedEmployeeIds(archivedEmployees);
        setActiveView(targetView);

        const canRestore = isArchived
          ? archivedData.conversations.some(c => c.employeeId === initialEmployee)
          : true;
        setCanRestoreInitialSelection(canRestore);
      } catch (error) {
        console.error('Failed to restore initial conversation view', error);
        if (cancelled) return;
        setActiveView('inbox');
        setCanRestoreInitialSelection(false);
      } finally {
        if (!cancelled) {
          setIsInitialSelectionReady(true);
        }
      }
    };

    setIsInitialSelectionReady(false);
    void restoreInitialConversation();

    return () => {
      cancelled = true;
    };
  }, [setActiveView, setArchivedEmployeeIds]);

  useEffect(() => {
    if (
      !isInitialSelectionReady ||
      !canRestoreInitialSelection ||
      !initialEmployeeIdRef.current ||
      initialEmployeeIdRef.current === activeEmployeeId
    ) {
      return;
    }

    void handleSelectConversation(initialEmployeeIdRef.current, true, initialDraftRef.current);
    setCanRestoreInitialSelection(false);
  }, [activeEmployeeId, canRestoreInitialSelection, handleSelectConversation, isInitialSelectionReady]);

  return {
    visibleDraftConversation,
    handleSelectConversation,
    handleViewChange,
  };
}
