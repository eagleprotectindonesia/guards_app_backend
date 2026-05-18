import {
  addGroupMembers,
  createGroupChat,
  finalizeGroupMessageDraft,
  getGroupMessages,
  leaveGroup,
  markGroupAsRead,
  removeGroupMember,
  reserveGroupMessageDraft,
  saveGroupMessage,
} from './group-chat';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    admin: { findUnique: jest.fn() },
    employee: { findUnique: jest.fn(), findMany: jest.fn() },
    groupChat: { create: jest.fn(), update: jest.fn() },
    groupChatParticipant: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    groupChatMembershipEvent: { create: jest.fn() },
    groupChatMessage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    groupChatReadReceipt: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

describe('group-chat repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async cb => cb(prisma));
  });

  test('createGroupChat creates owner and member participants', async () => {
    (prisma.groupChat.create as jest.Mock).mockResolvedValue({ id: 'group-1' });
    (prisma.groupChatParticipant.create as jest.Mock).mockResolvedValue({ id: 'p-owner' });

    await createGroupChat({
      title: 'Ops Team',
      creator: { participantType: 'admin', adminId: 'admin-1' },
      employeeIds: ['emp-1'],
      adminIds: ['admin-2'],
    });

    expect(prisma.groupChatParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'owner', adminId: 'admin-1' }) })
    );
    expect(prisma.groupChatParticipant.createMany).toHaveBeenCalledTimes(2);
  });

  test('addGroupMembers creates participants with visibleFromAt now', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({ id: 'owner-1', role: 'owner' });
    (prisma.groupChatParticipant.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-new', participantType: 'employee', employeeId: 'emp-2', status: 'active' }]);

    await addGroupMembers({
      groupId: 'group-1',
      actor: { participantType: 'admin', adminId: 'admin-1' },
      employeeIds: ['emp-2'],
    });

    expect(prisma.groupChatParticipant.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ employeeId: 'emp-2', visibleFromAt: expect.any(Date) })],
      })
    );
  });

  test('new member cannot see messages before visibleFromAt', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: 'p-1',
      visibleFromAt: new Date('2026-05-14T10:00:00.000Z'),
      leftAt: null,
      status: 'active',
    });
    (prisma.groupChatMessage.findMany as jest.Mock).mockResolvedValue([]);

    await getGroupMessages({ groupId: 'group-1', actor: { participantType: 'employee', employeeId: 'emp-1' } });

    expect(prisma.groupChatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: new Date('2026-05-14T10:00:00.000Z') }),
        }),
      })
    );
  });

  test('removed member cannot send messages', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      saveGroupMessage({
        groupId: 'group-1',
        actor: { participantType: 'employee', employeeId: 'emp-removed' },
        content: 'x',
      })
    ).rejects.toThrow('Active group participant not found');
  });

  test('owner can remove member but member cannot remove member', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
      .mockResolvedValueOnce({ id: 'member-1', role: 'member' });
    (prisma.groupChatParticipant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target-1',
      groupId: 'group-1',
      role: 'member',
    });
    (prisma.groupChatParticipant.update as jest.Mock).mockResolvedValue({ id: 'target-1', status: 'removed' });

    await expect(removeGroupMember({ groupId: 'group-1', actor: { participantType: 'admin', adminId: 'a1' }, participantId: 'target-1' })).resolves.toBeDefined();

    await expect(
      removeGroupMember({ groupId: 'group-1', actor: { participantType: 'admin', adminId: 'a2' }, participantId: 'target-1' })
    ).rejects.toThrow('Only group owner can perform this action');
  });

  test('owner leaving transfers ownership to earliest joined active participant', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'next-owner', role: 'member' });
    (prisma.groupChatParticipant.update as jest.Mock)
      .mockResolvedValueOnce({ id: 'owner-1', role: 'owner', status: 'left' })
      .mockResolvedValueOnce({ id: 'next-owner', role: 'owner', status: 'active' });

    await leaveGroup({ groupId: 'group-1', actor: { participantType: 'admin', adminId: 'a1' } });

    expect(prisma.groupChatParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'next-owner' }, data: { role: 'owner' } })
    );
  });

  test('owner admin cannot leave without another active admin', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: 'owner-1',
        role: 'owner',
        participantType: 'admin',
        status: 'active',
      })
      .mockResolvedValueOnce(null);

    await expect(leaveGroup({ groupId: 'group-1', actor: { participantType: 'admin', adminId: 'a1' } })).rejects.toThrow(
      'Owner cannot leave without another active admin'
    );
  });

  test('last member leaving archives group', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({ id: 'member-1', role: 'member' });
    (prisma.groupChatParticipant.update as jest.Mock).mockResolvedValue({ id: 'member-1', status: 'left' });
    (prisma.groupChatParticipant.count as jest.Mock).mockResolvedValue(0);

    await leaveGroup({ groupId: 'group-1', actor: { participantType: 'employee', employeeId: 'emp-1' } });

    expect(prisma.groupChat.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'group-1' }, data: { archivedAt: expect.any(Date) } })
    );
  });

  test('send increments unread and mark read resets unread', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: 'sender-1',
      role: 'member',
      participantType: 'admin',
      adminId: 'a1',
      employeeId: null,
    });
    (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ name: 'Admin Jane' });
    (prisma.groupChatMessage.create as jest.Mock).mockResolvedValue({
      id: 'm1',
      content: 'hello',
      senderName: 'Admin Jane',
      createdAt: new Date(),
    });

    await saveGroupMessage({ groupId: 'group-1', actor: { participantType: 'admin', adminId: 'a1' }, content: 'hello' });
    expect(prisma.groupChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderName: 'Admin Jane' }),
      })
    );
    expect(prisma.groupChatParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { increment: 1 } } })
    );

    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({ id: 'reader-1', role: 'member' });
    await markGroupAsRead({ groupId: 'group-1', actor: { participantType: 'employee', employeeId: 'emp-1' }, messageIds: ['m1'] });

    expect(prisma.groupChatParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reader-1' }, data: expect.objectContaining({ unreadCount: 0 }) })
    );
  });

  test('draft reservation and expiration behavior', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: 'sender-1',
      participantType: 'employee',
      employeeId: 'emp-1',
      adminId: null,
    });
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ fullName: 'Bob Employee' });
    (prisma.groupChatMessage.create as jest.Mock).mockResolvedValue({ id: 'draft-1' });

    await reserveGroupMessageDraft({ groupId: 'group-1', actor: { participantType: 'employee', employeeId: 'emp-1' } });
    expect(prisma.groupChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderName: 'Bob Employee' }),
      })
    );

    (prisma.groupChatMessage.findUnique as jest.Mock).mockResolvedValue({
      id: 'draft-1',
      groupId: 'group-1',
      senderParticipantId: 'sender-1',
      status: 'draft',
      draftExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      finalizeGroupMessageDraft({
        groupId: 'group-1',
        messageId: 'draft-1',
        actor: { participantType: 'employee', employeeId: 'emp-1' },
        content: 'final',
      })
    ).rejects.toThrow('Group draft has expired');
  });

  test('finalizeGroupMessageDraft updates senderName using resolved participant name', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: 'sender-1',
      participantType: 'admin',
      adminId: 'admin-1',
      employeeId: null,
      role: 'member',
    });
    (prisma.admin.findUnique as jest.Mock).mockResolvedValue({ name: 'Admin John' });
    (prisma.groupChatMessage.findUnique as jest.Mock).mockResolvedValue({
      id: 'draft-1',
      groupId: 'group-1',
      senderParticipantId: 'sender-1',
      status: 'draft',
      draftExpiresAt: new Date(Date.now() + 1000),
    });
    (prisma.groupChatMessage.update as jest.Mock).mockResolvedValue({
      id: 'draft-1',
      groupId: 'group-1',
      content: 'final',
      senderName: 'Admin John',
      createdAt: new Date(),
      sentAt: new Date(),
      draftExpiresAt: null,
    });

    await finalizeGroupMessageDraft({
      groupId: 'group-1',
      messageId: 'draft-1',
      actor: { participantType: 'admin', adminId: 'admin-1' },
      content: 'final',
    });

    expect(prisma.groupChatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderName: 'Admin John' }),
      })
    );
  });

  test('falls back to unknown sender labels when identity record is missing', async () => {
    (prisma.groupChatParticipant.findFirst as jest.Mock).mockResolvedValue({
      id: 'sender-1',
      role: 'member',
      participantType: 'employee',
      employeeId: 'emp-missing',
      adminId: null,
    });
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.groupChatMessage.create as jest.Mock).mockResolvedValue({
      id: 'm1',
      content: 'hello',
      senderName: 'Unknown Employee',
      createdAt: new Date(),
    });

    await saveGroupMessage({ groupId: 'group-1', actor: { participantType: 'employee', employeeId: 'emp-missing' }, content: 'hello' });

    expect(prisma.groupChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderName: 'Unknown Employee' }),
      })
    );
  });
});
