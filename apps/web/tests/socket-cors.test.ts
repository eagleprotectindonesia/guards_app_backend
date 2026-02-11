import { initSocket } from '@/lib/socket';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';

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
  },
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

describe('Socket.io CORS/Origin Restriction', () => {
  let mockIo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIo = {
      adapter: jest.fn(),
      use: jest.fn(),
      on: jest.fn(),
    };
    (SocketIOServer as unknown as jest.Mock).mockReturnValue(mockIo);
  });

  test('should initialize Socket.io with allowed origins from environment', () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://app.example.com';
    
    const server = createServer();
    initSocket(server);

    expect(SocketIOServer).toHaveBeenCalledWith(server, expect.objectContaining({
      cors: expect.objectContaining({
        origin: ['http://localhost:3000', 'https://app.example.com'],
      }),
    }));
  });

  test('should fallback to "*" if no ALLOWED_ORIGINS is provided (backwards compatibility or dev)', () => {
    delete process.env.ALLOWED_ORIGINS;
    
    const server = createServer();
    initSocket(server);

    expect(SocketIOServer).toHaveBeenCalledWith(server, expect.objectContaining({
      cors: expect.objectContaining({
        origin: '*',
      }),
    }));
  });
});
