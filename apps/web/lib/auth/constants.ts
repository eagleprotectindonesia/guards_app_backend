export const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export const AUTH_COOKIES = {
  ADMIN: 'admin_token',
  EMPLOYEE: 'employee_token',
} as const;

export const SESSION_CACHE_TTL = 3600; // 1 hour