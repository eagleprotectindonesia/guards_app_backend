import { getConversationList, getUnreadCount, setConversationArchiveState } from '@/lib/data-access/chat';
import { db as prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  db: {
    chatMessage: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    adminChatConversationState: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

describe('chat archive data-access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getConversationList hides archived conversations from inbox and unread views', async () => {
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValue([
      {
        employeeId: 'emp-1',
        content: 'new message',
        sender: 'employee',
        createdAt: '2026-03-09T10:00:00.000Z',
        adminId: null,
        employee: { fullName: 'Guard One', employeeNumber: '001' },
        admin: null,
      },
      {
        employeeId: 'emp-2',
        content: 'old message',
        sender: 'employee',
        createdAt: '2026-03-09T09:00:00.000Z',
        adminId: null,
        employee: { fullName: 'Guard Two', employeeNumber: '002' },
        admin: null,
      },
    ]);
    (prisma.adminChatConversationState.findMany as jest.Mock).mockResolvedValue([
      {
        adminId: 'admin-1',
        employeeId: 'emp-2',
        isArchived: true,
        isMuted: true,
      },
    ]);
    (prisma.chatMessage.groupBy as jest.Mock).mockResolvedValue([
      { employeeId: 'emp-1', _count: { id: 2 } },
      { employeeId: 'emp-2', _count: { id: 3 } },
    ]);

    const inbox = await getConversationList('admin-1', 'inbox');
    const unread = await getConversationList('admin-1', 'unread');
    const archived = await getConversationList('admin-1', 'archived');

    expect(inbox.map(conversation => conversation.employeeId)).toEqual(['emp-1']);
    expect(unread.map(conversation => conversation.employeeId)).toEqual(['emp-1']);
    expect(archived.map(conversation => conversation.employeeId)).toEqual(['emp-2']);
  });

  test('getUnreadCount excludes archived conversations for admins', async () => {
    (prisma.adminChatConversationState.findMany as jest.Mock).mockResolvedValue([{ employeeId: 'emp-2' }]);
    (prisma.chatMessage.count as jest.Mock).mockResolvedValue(4);

    const count = await getUnreadCount({
      isAdmin: true,
      adminId: 'admin-1',
    });

    expect(prisma.chatMessage.count).toHaveBeenCalledWith({
      where: {
        sender: 'employee',
        readAt: null,
        employeeId: {
          notIn: ['emp-2'],
        },
      },
    });
    expect(count).toBe(4);
  });

  test('setConversationArchiveState couples archive and mute state', async () => {
    (prisma.adminChatConversationState.upsert as jest.Mock).mockResolvedValue({
      employeeId: 'emp-1',
      isArchived: true,
      isMuted: true,
    });

    await setConversationArchiveState({
      adminId: 'admin-1',
      employeeId: 'emp-1',
      isArchived: true,
    });

    expect(prisma.adminChatConversationState.upsert).toHaveBeenCalledWith({
      where: {
        adminId_employeeId: {
          adminId: 'admin-1',
          employeeId: 'emp-1',
        },
      },
      update: {
        isArchived: true,
        isMuted: true,
        archivedAt: expect.any(Date),
        mutedAt: expect.any(Date),
      },
      create: {
        adminId: 'admin-1',
        employeeId: 'emp-1',
        isArchived: true,
        isMuted: true,
        archivedAt: expect.any(Date),
        mutedAt: expect.any(Date),
      },
    });
  });
});
