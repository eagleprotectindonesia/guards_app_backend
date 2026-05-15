import { mapDirectConversationToInboxItem, mapGroupConversationToInboxItem } from '@/types/chat-inbox';

describe('chat inbox adapters', () => {
  test('maps direct conversation to inbox item', () => {
    const item = mapDirectConversationToInboxItem({
      employeeId: 'emp-1',
      employeeName: 'Alice',
      employeeNumber: 'E1',
      isArchived: false,
      isMuted: true,
      unreadCount: 3,
      lastMessage: {
        content: 'Hi',
        sender: 'admin',
        createdAt: '2026-01-01T00:00:00.000Z',
        adminName: 'Admin One',
      },
    });

    expect(item).toMatchObject({ kind: 'direct', id: 'emp-1', title: 'Alice', isMuted: true, unreadCount: 3 });
    expect(item.lastMessage?.senderName).toBe('Admin One');
  });

  test('maps group conversation to inbox item', () => {
    const item = mapGroupConversationToInboxItem({
      kind: 'group',
      groupId: 'g1',
      title: 'Ops',
      memberCount: 5,
      currentUserRole: 'member',
      isArchived: false,
      isMuted: false,
      unreadCount: 1,
      lastMessage: { content: 'Ping', senderName: 'Bob', createdAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(item).toMatchObject({ kind: 'group', id: 'g1', title: 'Ops', unreadCount: 1 });
  });
});
