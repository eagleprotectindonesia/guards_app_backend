import { client } from './client';

export interface GroupChatMetadata {
  id: string;
  title: string;
  description: string | null;
  groupShiftId: string | null;
  createdByAdminId: string | null;
  createdByEmployeeId: string | null;
  lastMessageAt: string | null;
  lastMessageContent: string | null;
  lastMessageSenderName: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchGroupChat(groupId: string): Promise<GroupChatMetadata> {
  const response = await client.get(`/api/shared/group-chat/${groupId}`);
  return response.data as GroupChatMetadata;
}
