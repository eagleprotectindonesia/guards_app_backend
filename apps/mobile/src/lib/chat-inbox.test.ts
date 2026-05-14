import {
  directSupportInboxItem,
  inboxItemToConversationKey,
  mapGroupConversationToInboxItem,
  parseGroupChatListPayload,
} from './chat-inbox';

describe('mobile chat inbox adapters', () => {
  test('parses array payload', () => {
    const result = parseGroupChatListPayload([{ kind: 'group', groupId: 'g1', title: 'Ops', memberCount: 1, currentUserRole: 'member', isArchived: false, isMuted: false, unreadCount: 0 }]);
    expect(result).toHaveLength(1);
  });

  test('parses wrapped payload', () => {
    const result = parseGroupChatListPayload({ groups: [{ kind: 'group', groupId: 'g2', title: 'Night', memberCount: 1, currentUserRole: 'member', isArchived: false, isMuted: false, unreadCount: 2 }] });
    expect(result[0].groupId).toBe('g2');
  });

  test('maps group conversation to inbox item', () => {
    const item = mapGroupConversationToInboxItem({
      kind: 'group',
      groupId: 'g3',
      title: 'Alpha',
      description: 'desc',
      memberCount: 2,
      currentUserRole: 'owner',
      isArchived: false,
      isMuted: true,
      unreadCount: 4,
      lastMessage: { content: 'hello', senderName: 'Admin', createdAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(item).toMatchObject({ kind: 'group', id: 'g3', unreadCount: 4, isMuted: true });
  });

  test('builds conversation key by kind', () => {
    expect(inboxItemToConversationKey(directSupportInboxItem(1, 'Admin Support'))).toEqual({ kind: 'direct', employeeId: 'me' });
    expect(inboxItemToConversationKey({ kind: 'group', id: 'g9', title: 'G', unreadCount: 0, isMuted: false, isArchived: false, lastMessage: null })).toEqual({ kind: 'group', groupId: 'g9' });
  });
});
