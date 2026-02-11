import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { db as prisma } from '@/lib/prisma';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';
import { SocketData } from '@repo/types';

interface HandshakeLike {
  headers: { cookie?: string };
  auth: { role: 'admin' | 'employee'; token?: string };
}

export async function authenticateSocket(handshake: HandshakeLike): Promise<SocketData['auth'] | null> {
  const cookieHeader = handshake.headers.cookie;
  const authPayload = handshake.auth;

  let adminToken: string | undefined;
  let employeeToken: string | undefined;

  if (cookieHeader) {
    const cookies = cookie.parse(cookieHeader);
    adminToken = cookies[AUTH_COOKIES.ADMIN];
    employeeToken = cookies[AUTH_COOKIES.EMPLOYEE];
  }

  const tryAdminAuth = async () => {
    if (!adminToken) return null;
    const { isValid, userId } = await verifySession(adminToken, 'admin');
    if (isValid && userId) {
      return {
        type: 'admin' as const,
        id: userId,
      };
    }
    return null;
  };

  const tryEmployeeAuth = async () => {
    if (!employeeToken) return null;

    try {
      // Decode token to get clientType
      const decoded = jwt.decode(employeeToken) as {
        employeeId?: string;
        tokenVersion?: number;
        clientType?: 'mobile' | 'pwa';
      };

      const { isValid, userId } = await verifySession(employeeToken, 'employee');
      if (isValid && userId) {
        const employee = await prisma.employee.findUnique({
          where: { id: userId },
          select: { tokenVersion: true },
        });
        return {
          type: 'employee' as const,
          id: userId,
          tokenVersion: employee?.tokenVersion || 0,
          clientType: decoded?.clientType || 'pwa', // Default to pwa if not specified
        };
      }
    } catch (err) {
      console.error('[Socket Auth] Error in tryEmployeeAuth:', err);
    }
    return null;
  };

  const preferredRole = authPayload?.role;

  // Priority detection:
  // 1. If explicit token is provided in auth payload, prioritize the role it implies
  if (authPayload?.token) {
    try {
      const decoded = jwt.decode(authPayload.token) as { adminId?: string; employeeId?: string; guardId?: string };
      if (decoded?.adminId) {
        adminToken = authPayload.token;
        const auth = await tryAdminAuth();
        if (auth) return auth;
      } else if (decoded?.employeeId || decoded?.guardId) {
        employeeToken = authPayload.token;
        const auth = await tryEmployeeAuth();
        if (auth) return auth;
      }
    } catch {
      // Ignore decode error
    }
  }

  // 2. If preferred role is specified, try that first
  if (preferredRole === 'employee') {
    const auth = await tryEmployeeAuth();
    if (auth) return auth;
    return tryAdminAuth();
  }

  // 3. Default priority: Admin cookie then Employee cookie
  const adminAuth = await tryAdminAuth();
  if (adminAuth) return adminAuth;
  return tryEmployeeAuth();
}
