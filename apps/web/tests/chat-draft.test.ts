import { finalizeMessageDraft, getChatMessages, reserveMessageDraft } from '@/lib/data-access/chat';
import { db as prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  db: {
    chatMessage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    adminChatConversationState: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/s3', () => ({
  getCachedPresignedDownloadUrl: jest.fn(async (key: string) => `https://signed.example/${key}`),
}));

describe('chat draft data-access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reserveMessageDraft creates a hidden draft with expiry', async () => {
    (prisma.chatMessage.create as jest.Mock).mockResolvedValue({
      id: 'msg-draft-1',
      draftExpiresAt: new Date('2026-03-13T10:00:00.000Z'),
    });

    const draft = await reserveMessageDraft({
      employeeId: 'emp-1',
      adminId: 'admin-1',
      sender: 'admin',
    });

    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'emp-1',
        adminId: 'admin-1',
        sender: 'admin',
        status: 'draft',
        content: '',
        attachments: [],
        draftExpiresAt: expect.any(Date),
      }),
      include: expect.any(Object),
    });
    expect(draft.id).toBe('msg-draft-1');
  });

  test('finalizeMessageDraft updates the reserved draft into a sent message', async () => {
    (prisma.chatMessage.findUnique as jest.Mock).mockResolvedValue({
      id: 'msg-draft-1',
      employeeId: 'emp-1',
      adminId: 'admin-1',
      sender: 'admin',
      status: 'draft',
      draftExpiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.chatMessage.update as jest.Mock).mockResolvedValue({
      id: 'msg-draft-1',
      attachments: ['chat/key.png'],
    });

    const message = await finalizeMessageDraft({
      messageId: 'msg-draft-1',
      employeeId: 'emp-1',
      adminId: 'admin-1',
      sender: 'admin',
      content: 'Hello',
      attachments: ['chat/key.png'],
    });

    expect(prisma.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-draft-1' },
      data: expect.objectContaining({
        content: 'Hello',
        attachments: ['chat/key.png'],
        status: 'sent',
        sentAt: expect.any(Date),
        draftExpiresAt: null,
      }),
      include: expect.any(Object),
    });
    expect(message.attachments).toEqual(['https://signed.example/chat/key.png']);
  });

  test('getChatMessages excludes draft and expired rows', async () => {
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValue([]);

    await getChatMessages('emp-1');

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId: 'emp-1',
          status: 'sent',
        },
      })
    );
  });
});
