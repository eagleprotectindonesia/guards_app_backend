import { ChatInboxItem } from '@repo/types';

function sortItems(items: ChatInboxItem[]) {
  return [...items].sort((a, b) => {
    const aMs = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bMs = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    const diff = bMs - aMs;
    if (diff !== 0) return diff;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.id.localeCompare(b.id);
  });
}

describe('admin unified inbox sort', () => {
  test('merges and sorts direct + group by latest activity', () => {
    const items: ChatInboxItem[] = [
      { kind: 'direct', id: 'emp-1', title: 'A', unreadCount: 0, isMuted: false, isArchived: false, lastMessage: { content: 'x', senderName: 'a', createdAt: '2026-01-01T00:00:00.000Z' } },
      { kind: 'group', id: 'g-1', title: 'G', unreadCount: 0, isMuted: false, isArchived: false, lastMessage: { content: 'y', senderName: 'b', createdAt: '2026-02-01T00:00:00.000Z' } },
      { kind: 'direct', id: 'emp-2', title: 'B', unreadCount: 0, isMuted: false, isArchived: false, lastMessage: null },
    ];

    const sorted = sortItems(items);
    expect(sorted.map(i => i.id)).toEqual(['g-1', 'emp-1', 'emp-2']);
  });
});
