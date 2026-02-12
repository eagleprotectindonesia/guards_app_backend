/* eslint-disable @typescript-eslint/no-explicit-any */
import { initSocket } from '@/lib/socket';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { redis } from '@/lib/redis';

jest.mock('socket.io');
jest.mock('@socket.io/redis-adapter');
jest.mock('@/lib/redis', () => ({
  redis: {
    duplicate: jest.fn(() => ({
      on: jest.fn(),
      psubscribe: jest.fn(),
      subscribe: jest.fn(),
      quit: jest.fn(),
    })),
    get: jest.fn(),
    set: jest.fn(),
  },
}));
jest.mock('@/lib/socket-auth');
jest.mock('@/lib/prisma', () => ({ prisma: { chatMessage: { create: jest.fn() } } }));
jest.mock('@/lib/data-access/chat', () => ({
  saveMessage: jest.fn(),
  markAsReadForEmployee: jest.fn(),
  markAsReadForAdmin: jest.fn(),
}));

describe('Chat Locking Logic', () => {
  let mockIo: {
    adapter: jest.Mock;
    use: jest.Mock;
    on: jest.Mock;
    to: jest.Mock;
    emit: jest.Mock;
    connectionHandler?: any;
  };
  let mockSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIo = {
      adapter: jest.fn(),
      use: jest.fn(),
      on: jest.fn((event, cb) => {
        if (event === 'connection') mockIo.connectionHandler = cb;
      }),
      to: jest.fn(() => mockIo),
      emit: jest.fn(),
    };
    mockSocket = {
      data: { auth: { id: 'admin-1', type: 'admin' } },
      join: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    };
    (SocketIOServer as unknown as jest.Mock).mockReturnValue(mockIo);
  });

  test('should prevent Admin B from sending message if Admin A holds the lock', async () => {
    const server = createServer();
    initSocket(server);

    // Setup the connection handler
    const connectionHandler = mockIo.connectionHandler;

    // Admin B connects
    const socketB = { ...mockSocket, data: { auth: { id: 'admin-2', type: 'admin' } }, on: jest.fn() };
    connectionHandler(socketB);

    // Get the send_message listener for Admin B
    const sendMessageListener = socketB.on.mock.calls.find((call: any) => call[0] === 'send_message')[1];

    // Mock that Admin 1 holds the lock
    (redis.get as jest.Mock).mockResolvedValue('admin-1');

    await sendMessageListener({ employeeId: 'emp-123', content: 'Hello' });

    expect(socketB.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        message: 'Locked by another admin',
      })
    );
  });

  test('should allow Admin A to send message if they hold the lock', async () => {
    const server = createServer();
    initSocket(server);

    const connectionHandler = mockIo.connectionHandler;

    // Admin A connects
    const socketA = { ...mockSocket, data: { auth: { id: 'admin-1', type: 'admin' } }, on: jest.fn() };
    connectionHandler(socketA);

    const sendMessageListener = socketA.on.mock.calls.find((call: any) => call[0] === 'send_message')[1];

    // Mock that Admin 1 holds the lock
    (redis.get as jest.Mock).mockResolvedValue('admin-1');

    await sendMessageListener({ employeeId: 'emp-123', content: 'Hello' });

    expect(socketA.emit).not.toHaveBeenCalledWith('error', expect.any(Object));
  });

  test('should lock the conversation and notify others when an admin starts typing', async () => {
    const server = createServer();
    initSocket(server);

    const connectionHandler = mockIo.connectionHandler;

    // Admin A connects
    const socketA = { ...mockSocket, data: { auth: { id: 'admin-1', type: 'admin' } }, on: jest.fn() };
    connectionHandler(socketA);

    const typingListener = socketA.on.mock.calls.find((call: any) => call[0] === 'typing')[1];

    // Admin A starts typing for Employee 123
    await typingListener({ employeeId: 'emp-123', isTyping: true });

    // Should set lock in redis
    expect(redis.set).toHaveBeenCalledWith('chat_lock:emp-123', 'admin-1', 'EX', 120);

    // Should notify all admins
    expect(mockIo.to).toHaveBeenCalledWith('admin');
    expect(mockIo.emit).toHaveBeenCalledWith(
      'conversation_locked',
      expect.objectContaining({
        employeeId: 'emp-123',
        lockedBy: 'admin-1',
      })
    );
  });

  test('should allow the same admin to refresh the lock by typing', async () => {
    const server = createServer();
    initSocket(server);

    const connectionHandler = mockIo.connectionHandler;
    const socketA = { ...mockSocket, data: { auth: { id: 'admin-1', type: 'admin' } }, on: jest.fn() };
    connectionHandler(socketA);

    const typingListener = socketA.on.mock.calls.find((call: any) => call[0] === 'typing')[1];

    // Mock that Admin 1 ALREADY holds the lock
    (redis.get as jest.Mock).mockResolvedValue('admin-1');

    await typingListener({ employeeId: 'emp-123', isTyping: true });

    // Should refresh lock in redis
    expect(redis.set).toHaveBeenCalledWith('chat_lock:emp-123', 'admin-1', 'EX', 120);

    // Should re-notify others of the refresh
    expect(mockIo.emit).toHaveBeenCalledWith(
      'conversation_locked',
      expect.objectContaining({
        employeeId: 'emp-123',
        lockedBy: 'admin-1',
      })
    );
  });
});
