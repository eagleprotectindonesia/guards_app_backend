import { useCallback, useMemo } from 'react';
import { ConversationSelection, isSameConversation } from '@/lib/chat/conversation-selection';
import { StartChatCandidate } from '@/hooks/admin-unified-chat/use-unified-chat-items';

interface UseUnifiedChatSelectionParams {
  activeGroupId: string | null;
  activeEmployeeId: string | null;
  startChatCandidates: StartChatCandidate[];
  selectDirectConversation: (employeeId: string | null, skipCallback?: boolean) => Promise<void> | void;
  openDirectConversationFromLaunch: (payload: {
    employeeId: string;
    employeeName: string;
    employeeNumber?: string | null;
  }) => Promise<void> | void;
  selectGroupConversation: (groupId: string | null) => void;
  markGroupAsReadOptimistic: (groupId: string) => Promise<void> | void;
}

export function useUnifiedChatSelection({
  activeGroupId,
  activeEmployeeId,
  startChatCandidates,
  selectDirectConversation,
  openDirectConversationFromLaunch,
  selectGroupConversation,
  markGroupAsReadOptimistic,
}: UseUnifiedChatSelectionParams) {
  const selectedConversation = useMemo<ConversationSelection>(() => {
    if (activeGroupId) return { kind: 'group', id: activeGroupId };
    if (activeEmployeeId) return { kind: 'direct', id: activeEmployeeId };
    return null;
  }, [activeEmployeeId, activeGroupId]);

  const selectConversation = useCallback(
    (selection: ConversationSelection) => {
      if (isSameConversation(selectedConversation, selection)) return;

      if (!selection) {
        selectDirectConversation(null);
        selectGroupConversation(null);
        return;
      }

      if (selection.kind === 'direct') {
        selectGroupConversation(null);
        const employee = startChatCandidates.find(candidate => candidate.id === selection.id);
        if (employee) {
          void openDirectConversationFromLaunch({
            employeeId: employee.id,
            employeeName: employee.fullName,
            employeeNumber: employee.employeeNumber,
          });
          return;
        }
        void selectDirectConversation(selection.id, false);
        return;
      }

      selectDirectConversation(null, true);
      selectGroupConversation(selection.id);
      void markGroupAsReadOptimistic(selection.id);
    },
    [
      selectedConversation,
      selectDirectConversation,
      selectGroupConversation,
      startChatCandidates,
      openDirectConversationFromLaunch,
      markGroupAsReadOptimistic,
    ]
  );

  return {
    selectedConversation,
    selectConversation,
  };
}
