describe('getJwtSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.JWT_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('throws in production when JWT_SECRET is missing', async () => {
    Object.assign(process.env, { NODE_ENV: 'production' });
    const { getJwtSecret } = await import('@/lib/auth/constants');

    expect(() => getJwtSecret()).toThrow('JWT_SECRET is required in production');
  });

  test('uses the development fallback outside production', async () => {
    Object.assign(process.env, { NODE_ENV: 'test' });
    const { getJwtSecret } = await import('@/lib/auth/constants');

    expect(getJwtSecret()).toBe('supersecretjwtkey');
  });

  test('reads JWT_SECRET at call time', async () => {
    Object.assign(process.env, { NODE_ENV: 'production' });
    process.env.JWT_SECRET = 'first-secret';
    const { getJwtSecret } = await import('@/lib/auth/constants');

    expect(getJwtSecret()).toBe('first-secret');

    process.env.JWT_SECRET = 'second-secret';
    expect(getJwtSecret()).toBe('second-secret');
  });
});
