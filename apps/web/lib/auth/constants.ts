export const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const isExplicitFalse = (value?: string) => value === 'false' || value === '0';
const isExplicitTrue = (value?: string) => value === 'true' || value === '1';

export const AUTH_COOKIE_SECURE =
  isExplicitTrue(process.env.AUTH_COOKIE_SECURE) ||
  (process.env.NODE_ENV === 'production' && !isExplicitFalse(process.env.AUTH_COOKIE_SECURE));

export const AUTH_COOKIES = {
  ADMIN: 'admin_token',
  ADMIN_2FA_PENDING: 'admin_2fa_pending',
  EMPLOYEE: 'employee_token',
} as const;

export const SESSION_CACHE_TTL = 10 * 3600; // 10 hour
