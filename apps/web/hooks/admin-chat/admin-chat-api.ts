import { Conversation } from '@/types/chat';

export interface ConversationLaunchInfoResponse {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  exists: boolean;
  isArchived: boolean;
  isMuted: boolean;
}

export async function reserveChatDraft(employeeId: string) {
  const response = await fetch(`/api/shared/chat/${employeeId}/draft`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to reserve chat draft');
  }

  const body = (await response.json()) as { messageId?: string };
  if (!body.messageId) {
    throw new Error('Draft reservation did not return a messageId');
  }

  return body.messageId;
}

export async function fetchAdminUnreadCountApi() {
  const res = await fetch('/api/shared/chat/unread?role=admin');
  if (!res.ok) return null;
  const data = (await res.json()) as { count: number };
  return data.count;
}

export async function fetchArchivedConversationIdsApi() {
  const url = new URL('/api/shared/chat/conversations', window.location.origin);
  url.searchParams.set('view', 'archived');
  url.searchParams.set('limit', '200');

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { conversations: Conversation[]; nextCursor: string | null };
  return data.conversations.map(c => c.employeeId);
}

export async function patchConversationArchiveState(employeeId: string, isArchived: boolean) {
  const res = await fetch(`/api/shared/chat/conversations/${employeeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isArchived }),
  });

  if (!res.ok) {
    throw new Error('Failed to update archive state');
  }

  return (await res.json()) as Pick<Conversation, 'employeeId' | 'isArchived' | 'isMuted'>;
}

export async function fetchConversationLaunchInfo(employeeId: string) {
  const response = await fetch(`/api/shared/chat/conversations/${employeeId}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as ConversationLaunchInfoResponse;
}
