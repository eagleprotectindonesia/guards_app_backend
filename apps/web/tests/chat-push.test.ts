const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockSaveMessage = jest.fn();
const mockSendChatPushNotification = jest.fn();

jest.mock('@/lib/redis', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

jest.mock('@/lib/data-access/chat', () => ({
  saveMessage: mockSaveMessage,
  markAsReadForEmployee: jest.fn(),
  markAsReadForAdmin: jest.fn(),
}));

jest.mock('@/lib/fcm', () => ({
  sendChatPushNotification: mockSendChatPushNotification,
}));

import { registerChatHandlers } from '@/lib/socket/chat';

describe('registerChatHandlers push decision logging', () => {
  let infoSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
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
      data: { auth: { id: 'admin-1', type: 'admin' } },
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
    expect(infoSpy).toHaveBeenCalledWith('[Chat] Admin message push decision', {
      employeeId: 'emp-1',
      messageId: 'msg-1',
      socketCount: 0,
      pushAttempted: true,
      pushResult: {
        attempted: true,
        tokenCount: 1,
        successCount: 1,
        failureCount: 0,
        staleTokenCount: 0,
        reason: 'sent',
      },
    });
  });
});
