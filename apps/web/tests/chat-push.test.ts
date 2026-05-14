const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockSaveMessage = jest.fn();
const mockFinalizeMessageDraft = jest.fn();
const mockSaveGroupMessage = jest.fn();
const mockListGroupMembers = jest.fn();
const mockGetActiveGroupParticipant = jest.fn();
const mockMarkGroupAsRead = jest.fn();
const mockListActiveGroupIdsForParticipant = jest.fn();
const mockListGroupChatPushTargets = jest.fn();
const mockSendChatPushNotification = jest.fn();

jest.mock('@repo/database/redis', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

jest.mock('@/lib/data-access/chat', () => ({
  saveMessage: mockSaveMessage,
  finalizeMessageDraft: mockFinalizeMessageDraft,
  markAsReadForEmployee: jest.fn(),
  markAsReadForAdmin: jest.fn(),
}));

jest.mock('@/lib/data-access/group-chat', () => ({
  saveGroupMessage: mockSaveGroupMessage,
  finalizeGroupMessageDraft: jest.fn(),
  getActiveGroupParticipant: mockGetActiveGroupParticipant,
  markGroupAsRead: mockMarkGroupAsRead,
  listActiveGroupIdsForParticipant: mockListActiveGroupIdsForParticipant,
  listGroupMembers: mockListGroupMembers,
  listGroupChatPushTargets: mockListGroupChatPushTargets,
}));

jest.mock('@/lib/fcm', () => ({
  sendChatPushNotification: mockSendChatPushNotification,
  sendGroupChatPushNotification: jest.fn(),
}));

import { registerChatHandlers } from '@/lib/socket/chat';

describe('registerChatHandlers push decision logging', () => {
  let infoSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListActiveGroupIdsForParticipant.mockResolvedValue([]);
    mockListGroupChatPushTargets.mockResolvedValue([]);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('logs push decision and result when no employee sockets are active', async () => {
    const fetchSockets = jest.fn().mockResolvedValue([]);
    const io = {
      to: jest.fn(function () {
        return this;
      }),
      emit: jest.fn(),
      in: jest.fn(() => ({
        fetchSockets,
      })),
    };
    const socket = {
      data: { auth: { id: 'admin-1', type: 'admin', permissions: ['chat:view', 'chat:create'] } },
      on: jest.fn(),
      emit: jest.fn(),
    };

    mockRedisGet.mockResolvedValue(null);
    mockSaveMessage.mockResolvedValue({
      id: 'msg-1',
      admin: { name: 'Admin Jane' },
    });
    mockSendChatPushNotification.mockResolvedValue({
      attempted: true,
      tokenCount: 1,
      successCount: 1,
      failureCount: 0,
      staleTokenCount: 0,
      reason: 'sent',
    });

    registerChatHandlers(io as never, socket as never);

    const sendMessageListener = socket.on.mock.calls.find(call => call[0] === 'send_message')?.[1];
    await sendMessageListener({ employeeId: 'emp-1', content: 'Hello', attachments: [] });

    expect(fetchSockets).toHaveBeenCalled();
    expect(mockSendChatPushNotification).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      senderName: 'Admin Jane',
      content: 'Hello',
      messageId: 'msg-1',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('emits unauthorized and disconnects when admin FK is invalid', async () => {
    const io = {
      to: jest.fn(function () {
        return this;
      }),
      emit: jest.fn(),
      in: jest.fn(() => ({
        fetchSockets: jest.fn().mockResolvedValue([]),
      })),
    };
    const socket = {
      data: { auth: { id: 'admin-missing', type: 'admin', permissions: ['chat:view', 'chat:create'] } },
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    mockRedisGet.mockResolvedValue(null);
    const fkError = Object.assign(new Error('fk'), {
      code: 'P2003',
      meta: { constraint_name: 'chat_messages_admin_id_fkey' },
    });
    mockSaveMessage.mockRejectedValue(fkError);

    registerChatHandlers(io as never, socket as never);
    const sendMessageListener = socket.on.mock.calls.find(call => call[0] === 'send_message')?.[1];
    await sendMessageListener({ employeeId: 'emp-1', content: 'Hello', attachments: [] });

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  test('group_send_message only emits to active participants, not group room', async () => {
    const io = {
      to: jest.fn(function () {
        return this;
      }),
      emit: jest.fn(),
      in: jest.fn(() => ({
        fetchSockets: jest.fn().mockResolvedValue([]),
      })),
    };
    const socket = {
      data: { auth: { id: 'admin-1', type: 'admin', permissions: ['chat:view', 'chat:create'] } },
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };

    mockSaveGroupMessage.mockResolvedValue({
      id: 'gmsg-1',
      groupId: 'group-1',
      senderName: 'Admin',
      createdAt: new Date('2026-05-14T01:00:00.000Z'),
      sentAt: new Date('2026-05-14T01:00:00.000Z'),
      draftExpiresAt: null,
      content: 'Hello group',
      attachments: [],
    });
    mockListGroupMembers.mockResolvedValue([
      { participantType: 'employee', employeeId: 'emp-1' },
      { participantType: 'admin', adminId: 'admin-2' },
    ]);

    registerChatHandlers(io as never, socket as never);
    const groupListener = socket.on.mock.calls.find(call => call[0] === 'group_send_message')?.[1];
    await groupListener({ groupId: 'group-1', content: 'Hello group', attachments: [] });

    expect(io.to).toHaveBeenCalledWith('employee:emp-1');
    expect(io.to).toHaveBeenCalledWith('admin:admin-2');
    expect(io.to).not.toHaveBeenCalledWith('group:group-1');
  });
});
