import { authenticateSocket } from '@repo/realtime';

const mockVerifySession = jest.fn();
const mockFindUnique = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('@repo/auth-server', () => ({
  AUTH_COOKIES: {
    ADMIN: 'admin_token',
    EMPLOYEE: 'employee_token',
  },
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
}));

jest.mock('@repo/database', () => ({
  db: {
    admin: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

jest.mock('@repo/database/redis', () => ({
  redis: {
    del: (...args: unknown[]) => mockRedisDel(...args),
  },
}));

describe('authenticateSocket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('authenticates valid admin socket when admin exists', async () => {
    mockVerifySession.mockResolvedValue({ isValid: true, userId: 'admin-1', permissions: ['chat:view'] });
    mockFindUnique.mockResolvedValue({ id: 'admin-1', deletedAt: null });

    const result = await authenticateSocket({
      headers: { cookie: 'admin_token=admin-jwt' },
      auth: { role: 'admin' },
    });

    expect(mockVerifySession).toHaveBeenCalledWith('admin-jwt', 'admin');
    expect(result).toEqual({ type: 'admin', id: 'admin-1', permissions: ['chat:view'] });
  });

  test('rejects admin socket and clears stale cache when admin row is missing', async () => {
    mockVerifySession.mockResolvedValue({ isValid: true, userId: 'admin-missing', permissions: ['chat:view'] });
    mockFindUnique.mockResolvedValue(null);

    const result = await authenticateSocket({
      headers: { cookie: 'admin_token=admin-jwt' },
      auth: { role: 'admin' },
    });

    expect(result).toBeNull();
    expect(mockRedisDel).toHaveBeenCalledWith('admin:token_version:admin-missing', 'admin:permissions:admin-missing');
  });

  test('enforces strict admin role and does not fallback to employee auth', async () => {
    mockVerifySession.mockImplementation((token: string, type: string) => {
      if (type === 'admin') {
        return Promise.resolve({ isValid: false, userId: null });
      }
      return Promise.resolve({ isValid: true, userId: 'emp-1' });
    });

    const result = await authenticateSocket({
      headers: { cookie: 'admin_token=bad-admin; employee_token=good-employee' },
      auth: { role: 'admin' },
    });

    expect(result).toBeNull();
    expect(mockVerifySession).toHaveBeenCalledWith('bad-admin', 'admin');
    expect(mockVerifySession).not.toHaveBeenCalledWith('good-employee', 'employee');
  });
});
