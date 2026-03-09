const mockFindMany = jest.fn();
const mockDeleteMany = jest.fn();
const mockSendEachForMulticast = jest.fn();

jest.mock('@/lib/prisma', () => ({
  db: {
    fcmToken: {
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
    },
  },
}));

jest.mock('@/lib/firebase-admin', () => ({
  firebaseAdmin: {
    apps: [{}],
    messaging: jest.fn(() => ({
      sendEachForMulticast: mockSendEachForMulticast,
    })),
  },
}));

import { sendChatPushNotification } from '@/lib/fcm';

describe('sendChatPushNotification', () => {
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('returns no_tokens when no FCM tokens are registered', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await sendChatPushNotification({
      employeeId: 'emp-1',
      senderName: 'Admin',
      content: 'Hello',
      messageId: 'msg-1',
    });

    expect(result).toEqual({
      attempted: false,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      staleTokenCount: 0,
      reason: 'no_tokens',
    });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith('[FCM] Chat push skipped: no registered tokens', {
      employeeId: 'emp-1',
      messageId: 'msg-1',
    });
  });

  test('returns success counts when multicast send succeeds', async () => {
    mockFindMany.mockResolvedValue([{ token: 'token-1' }, { token: 'token-2' }]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    const result = await sendChatPushNotification({
      employeeId: 'emp-1',
      senderName: 'Admin Jane',
      content: 'Hello there',
      messageId: 'msg-1',
    });

    expect(result).toEqual({
      attempted: true,
      tokenCount: 2,
      successCount: 2,
      failureCount: 0,
      staleTokenCount: 0,
      reason: 'sent',
    });
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: {
          title: 'Message from Admin Jane',
          body: 'Hello there',
        },
        android: expect.objectContaining({
          priority: 'high',
          notification: expect.objectContaining({
            title: 'Message from Admin Jane',
            body: 'Hello there',
            channelId: 'chat_messages_v2',
            sound: 'default',
          }),
        }),
        tokens: ['token-1', 'token-2'],
      })
    );
    expect(infoSpy).toHaveBeenCalledWith('[FCM] Chat push send result', {
      employeeId: 'emp-1',
      messageId: 'msg-1',
      tokenCount: 2,
      successCount: 2,
      failureCount: 0,
    });
  });

  test('deletes stale tokens after invalid registration failures', async () => {
    mockFindMany.mockResolvedValue([{ token: 'token-one' }, { token: 'token-two' }]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: true },
      ],
    });

    const result = await sendChatPushNotification({
      employeeId: 'emp-1',
      senderName: 'Admin',
      content: 'Hello',
      messageId: 'msg-1',
    });

    expect(result).toEqual({
      attempted: true,
      tokenCount: 2,
      successCount: 1,
      failureCount: 1,
      staleTokenCount: 1,
      reason: 'sent',
    });
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['token-one'] } },
    });
    expect(warnSpy).toHaveBeenCalledWith('[FCM] Chat push token delivery failed', {
      employeeId: 'emp-1',
      messageId: 'msg-1',
      tokenSuffix: 'oken-one',
      errorCode: 'messaging/registration-token-not-registered',
    });
    expect(warnSpy).toHaveBeenCalledWith('[FCM] Removed stale FCM tokens after failed chat push', {
      employeeId: 'emp-1',
      messageId: 'msg-1',
      staleTokenCount: 1,
      tokenSuffixes: ['oken-one'],
    });
  });
});
