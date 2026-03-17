const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockEmployeeFindUnique = jest.fn();

jest.mock('@/lib/redis', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
  },
}));

jest.mock('@/lib/prisma', () => ({
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

describe('verifySession employee sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts an active employee session', async () => {
    const token = jwt.sign(
      {
        employeeId: 'emp-1',
        sessionId: 'session-1',
        clientType: 'mobile',
      },
      process.env.JWT_SECRET || 'supersecretjwtkey'
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
    });
  });

  test('rejects an employee token without sessionId', async () => {
    const token = jwt.sign(
      {
        employeeId: 'emp-1',
      },
      process.env.JWT_SECRET || 'supersecretjwtkey'
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
      process.env.JWT_SECRET || 'supersecretjwtkey'
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
