export const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export const AUTH_COOKIES = {
  ADMIN: 'admin_token',
  ADMIN_2FA_PENDING: 'admin_2fa_pending',
  EMPLOYEE: 'employee_token',
} as const;

export const SESSION_CACHE_TTL = 10 * 3600; // 10 hour
