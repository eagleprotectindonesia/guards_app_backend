'use client';

import { useCallback, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Conversation } from '@/types/chat';
import { AdminChatLaunchPayload } from '@/hooks/use-admin-chat';
import { fetchConversationLaunchInfo, patchConversationArchiveState } from '@/hooks/admin-chat/admin-chat-api';

type ConversationView = 'inbox' | 'unread' | 'archived';

interface UseAdminChatArchiveParams {
  activeEmployeeId: string | null;
  activeView: ConversationView;
  conversations: Conversation[];
  fetchConversations: (view?: ConversationView) => void;
  fetchAdminUnreadCount: () => Promise<void>;
  handleSelectConversation: (employeeId: string | null, skipCallback?: boolean, draft?: AdminChatLaunchPayload | null) => Promise<void>;
  setActiveView: (view: ConversationView) => void;
  archivedEmployeeIds: string[];
  setArchivedEmployeeIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useAdminChatArchive({
  activeEmployeeId,
  activeView,
  conversations,
  fetchConversations,
  fetchAdminUnreadCount,
  handleSelectConversation,
  setActiveView,
  archivedEmployeeIds,
  setArchivedEmployeeIds,
}: UseAdminChatArchiveParams) {
  const [pendingArchivedLaunch, setPendingArchivedLaunch] = useState<AdminChatLaunchPayload | null>(null);

  const archiveConversation = useCallback(
    async (employeeId: string, isArchived: boolean) => {
      const data = await patchConversationArchiveState(employeeId, isArchived);

      if (isArchived) {
        setArchivedEmployeeIds(prev => (prev.includes(employeeId) ? prev : [...prev, employeeId]));
        if (activeEmployeeId === employeeId) {
          setActiveView('archived');
        }
        fetchConversations('inbox');
        fetchConversations('archived');
      } else if (activeEmployeeId === employeeId) {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        setActiveView('inbox');
        fetchConversations('inbox');
        fetchConversations('archived');
      } else if (activeView === 'archived') {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        fetchConversations('archived');
      } else {
        setArchivedEmployeeIds(prev => prev.filter(id => id !== employeeId));
        fetchConversations(activeView);
      }

      await fetchAdminUnreadCount();
      return data;
    },
    [activeEmployeeId, activeView, fetchAdminUnreadCount, fetchConversations, setActiveView, setArchivedEmployeeIds]
  );

  const handleArchiveConversation = useCallback(
    async (employeeId: string) => {
      try {
        await archiveConversation(employeeId, true);
      } catch (error) {
        console.error('Failed to archive conversation:', error);
        toast.error('Failed to archive conversation');
      }
    },
    [archiveConversation]
  );

  const handleUnarchiveConversation = useCallback(
    async (employeeId: string) => {
      try {
        await archiveConversation(employeeId, false);
      } catch (error) {
        console.error('Failed to unarchive conversation:', error);
        toast.error('Failed to unarchive conversation');
      }
    },
    [archiveConversation]
  );

  const openConversationFromLaunch = useCallback(
    async (launch: AdminChatLaunchPayload) => {
      const info = await fetchConversationLaunchInfo(launch.employeeId);
      if (!info) {
        toast.error('Failed to open conversation');
        return;
      }

      const normalizedLaunch: AdminChatLaunchPayload = {
        employeeId: info.employeeId,
        employeeName: info.employeeName,
        employeeNumber: info.employeeNumber,
      };

      const existingConversation = conversations.find(conversation => conversation.employeeId === launch.employeeId);
      const isArchived = info.isArchived || archivedEmployeeIds.includes(launch.employeeId);
      if (isArchived && !existingConversation?.isDraft) {
        setPendingArchivedLaunch(normalizedLaunch);
        return;
      }

      setActiveView('inbox');
      await handleSelectConversation(
        normalizedLaunch.employeeId,
        false,
        info.exists || existingConversation ? null : normalizedLaunch
      );
    },
    [archivedEmployeeIds, conversations, handleSelectConversation, setActiveView]
  );

  const confirmArchivedLaunch = useCallback(async () => {
    if (!pendingArchivedLaunch) return;

    const launch = pendingArchivedLaunch;
    setPendingArchivedLaunch(null);
    setActiveView('inbox');
    await archiveConversation(launch.employeeId, false);
    await fetchConversations('inbox');
    await handleSelectConversation(launch.employeeId, false, null);
  }, [archiveConversation, fetchConversations, handleSelectConversation, pendingArchivedLaunch, setActiveView]);

  const cancelArchivedLaunch = useCallback(() => {
    setPendingArchivedLaunch(null);
  }, []);

  return {
    pendingArchivedLaunch,
    handleArchiveConversation,
    handleUnarchiveConversation,
    openConversationFromLaunch,
    confirmArchivedLaunch,
    cancelArchivedLaunch,
  };
}
