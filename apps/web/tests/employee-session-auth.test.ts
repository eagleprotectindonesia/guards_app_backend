const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockEmployeeFindUnique = jest.fn();

jest.mock('@repo/database/redis', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

jest.mock('@repo/database', () => ({
  db: {
    employee: {
      findUnique: mockEmployeeFindUnique,
    },
    admin: {
      findUnique: jest.fn(),
    },
  },
}));

import jwt from 'jsonwebtoken';
import { verifySession } from '@/lib/auth/session';
import { DEFAULT_ROLE_POLICY } from '@/lib/auth/admin-visibility';
import { getJwtSecret } from '@/lib/auth/constants';

describe('verifySession employee sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('classifies malformed tokens as invalid tokens', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await verifySession('not-a-jwt', 'employee');

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('invalid_token');
    expect(mockEmployeeFindUnique).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('accepts an active employee session', async () => {
    const token = jwt.sign(
      {
        employeeId: 'emp-1',
        sessionId: 'session-1',
        clientType: 'mobile',
      },
      getJwtSecret()
    );

    mockEmployeeFindUnique.mockResolvedValue({
      status: true,
      deletedAt: null,
      sessions: [
        {
          id: 'session-1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    const result = await verifySession(token, 'employee');

    expect(result).toEqual({
      isValid: true,
      userId: 'emp-1',
      role: 'employee',
      roleName: null,
      permissions: [],
      rolePolicy: DEFAULT_ROLE_POLICY,
    });
  });

  test('rejects an employee token without sessionId', async () => {
    const token = jwt.sign(
      {
        employeeId: 'emp-1',
      },
      getJwtSecret()
    );

    const result = await verifySession(token, 'employee');

    expect(result.isValid).toBe(false);
    expect(mockEmployeeFindUnique).not.toHaveBeenCalled();
  });

  test('rejects a revoked employee session', async () => {
    const token = jwt.sign(
      {
        employeeId: 'emp-1',
        sessionId: 'session-1',
      },
      getJwtSecret()
    );

    mockEmployeeFindUnique.mockResolvedValue({
      status: true,
      deletedAt: null,
      sessions: [
        {
          id: 'session-1',
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    const result = await verifySession(token, 'employee');

    expect(result.isValid).toBe(false);
  });
});
