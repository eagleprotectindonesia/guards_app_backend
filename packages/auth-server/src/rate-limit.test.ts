const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();
const mockTtl = jest.fn();
const mockMulti = jest.fn();

jest.mock('@repo/database/redis', () => ({
  redis: {
    get: mockGet,
    set: mockSet,
    del: mockDel,
    ttl: mockTtl,
    multi: mockMulti,
  },
}));

import {
  checkLoginThrottle,
  recordLoginFailure,
  clearLoginFailures,
  check2faAttempts,
  record2faFailure,
  clear2faAttempts,
  checkBiometricThrottle,
  recordBiometricFailure,
  clientIp,
  RateLimitBackendError,
} from './rate-limit';

// Helper to simulate ioredis multi() chaining
function mockMultiChain(results: [Error | null, unknown][]) {
  const exec = jest.fn().mockResolvedValue(results);
  const mock = { incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec };
  mockMulti.mockReturnValue(mock);
  return mock;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// --- clientIp -----------------------------------------------------------------

describe('clientIp', () => {
  it('extracts IP from x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '198.51.100.2' },
    });
    expect(clientIp(req)).toBe('198.51.100.2');
  });

  it('returns "unknown" when no header present', () => {
    const req = new Request('http://localhost');
    expect(clientIp(req)).toBe('unknown');
  });
});

// --- Login throttle -----------------------------------------------------------

describe('checkLoginThrottle', () => {
  it('allows if under limits', async () => {
    mockGet.mockResolvedValue(null);
    const result = await checkLoginThrottle({ accountKey: 'admin@test.com', ip: '1.2.3.4' });
    expect(result.allowed).toBe(true);
  });

  it('blocks when account exceeds max attempts', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key.startsWith('login:fail:')) return '5';
      return null;
    });
    mockTtl.mockResolvedValue(800);
    const result = await checkLoginThrottle({ accountKey: 'admin@test.com', ip: '1.2.3.4' });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(800);
  });

  it('blocks when IP exceeds max attempts', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key.startsWith('login:ip:')) return '30';
      return null;
    });
    mockTtl.mockResolvedValue(400);
    const result = await checkLoginThrottle({ accountKey: 'admin@test.com', ip: '1.2.3.4' });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(400);
  });
});

describe('recordLoginFailure', () => {
  it('increments both account and IP counters', async () => {
    const multi = mockMultiChain([[null, 3], [null, 1]]);

    await recordLoginFailure({ accountKey: 'emp001', ip: '1.2.3.4' });

    expect(multi.incr).toHaveBeenCalledTimes(2);
    expect(multi.incr).toHaveBeenCalledWith('login:fail:emp001');
    expect(multi.incr).toHaveBeenCalledWith('login:ip:1.2.3.4');
    expect(multi.expire).toHaveBeenCalledTimes(2);
    await multi.exec();
  });
});

describe('clearLoginFailures', () => {
  it('deletes both counters', async () => {
    await clearLoginFailures({ accountKey: 'emp001', ip: '1.2.3.4' });
    expect(mockDel).toHaveBeenCalledWith('login:fail:emp001', 'login:ip:1.2.3.4');
  });
});

// --- 2FA attempt counter ------------------------------------------------------

describe('check2faAttempts', () => {
  it('allows if under limit and not locked', async () => {
    mockGet.mockResolvedValue(null);
    const result = await check2faAttempts('admin-1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when locked flag is set', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key.includes('2fa:locked:')) return '1';
      return null;
    });
    mockTtl.mockResolvedValue(120);
    const result = await check2faAttempts('admin-1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(120);
  });

  it('blocks when fail count reaches max and sets lock', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key.includes('2fa:fail:')) return '5';
      return null;
    });
    mockSet.mockResolvedValue('OK');

    const result = await check2faAttempts('admin-1');
    expect(result.allowed).toBe(false);
    expect(mockSet).toHaveBeenCalledWith('2fa:locked:admin-1', '1', 'EX', 300);
  });
});

describe('record2faFailure', () => {
  it('increments counter and sets lock at threshold', async () => {
    const multi = mockMultiChain([[null, 5]]);
    mockSet.mockResolvedValue('OK');

    await record2faFailure('admin-1');

    expect(multi.incr).toHaveBeenCalledWith('2fa:fail:admin-1');
    expect(mockSet).toHaveBeenCalledWith('2fa:locked:admin-1', '1', 'EX', 300);
  });
});

describe('clear2faAttempts', () => {
  it('deletes fail and lock keys', async () => {
    await clear2faAttempts('admin-1');
    expect(mockDel).toHaveBeenCalledWith('2fa:fail:admin-1', '2fa:locked:admin-1');
  });
});

// --- Biometric throttle -------------------------------------------------------

describe('checkBiometricThrottle', () => {
  it('allows when under limit', async () => {
    mockGet.mockResolvedValue(null);
    const result = await checkBiometricThrottle({ tokenHash: 'abc123', ip: '1.2.3.4' });
    expect(result.allowed).toBe(true);
  });

  it('blocks at max attempts', async () => {
    mockGet.mockResolvedValue('10');
    mockTtl.mockResolvedValue(500);
    const result = await checkBiometricThrottle({ tokenHash: 'abc123', ip: '1.2.3.4' });
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(500);
  });
});

describe('recordBiometricFailure', () => {
  it('increments counter for the token hash', async () => {
    const multi = mockMultiChain([[null, 2]]);

    await recordBiometricFailure({ tokenHash: 'abc123', ip: '1.2.3.4' });

    expect(multi.incr).toHaveBeenCalledWith('biometric:fail:abc123');
  });
});

// --- Error handling (fail closed on Redis failure) ----------------------------

describe('RateLimitBackendError', () => {
  it('thrown when Redis get fails', async () => {
    mockGet.mockRejectedValue(new Error('connection refused'));
    await expect(checkLoginThrottle({ accountKey: 'x', ip: '1' })).rejects.toThrow(RateLimitBackendError);
  });

  it('thrown when Redis set fails', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key.includes('2fa:locked:')) return null;
      if (key.includes('2fa:fail:')) return '5';
      return null;
    });
    mockSet.mockRejectedValue(new Error('connection refused'));
    await expect(check2faAttempts('admin-1')).rejects.toThrow(RateLimitBackendError);
  });

  it('thrown when Redis multi exec fails', async () => {
    const exec = jest.fn().mockRejectedValue(new Error('connection refused'));
    mockMulti.mockReturnValue({ incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec });
    await expect(recordLoginFailure({ accountKey: 'x', ip: '1' })).rejects.toThrow(RateLimitBackendError);
  });
});
