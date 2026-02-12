import { cookies, headers } from 'next/headers';
import { getEmployeeById } from '@/lib/data-access/employees';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';

export type EmployeePayload = {
  employeeId: string;
  tokenVersion?: number;
};

export async function getAuthenticatedEmployee() {
  let token: string | undefined;

  // 1. Try cookie
  const tokenCookie = (await cookies()).get(AUTH_COOKIES.EMPLOYEE);
  if (tokenCookie) {
    token = tokenCookie.value;
  }

  // 2. Try Authorization header if cookie is missing
  if (!token) {
    const authHeader = (await headers()).get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return null;
  }

  const { isValid, userId } = await verifySession(token, 'employee');

  if (!isValid || !userId) {
    return null;
  }

  return getEmployeeById(userId);
}

/**
 * Lightweight session verification that favors Redis cache over DB.
 * Ideal for high-frequency polling.
 */
export async function verifyEmployeeSession() {
  let token: string | undefined;

  // 1. Try cookie
  const tokenCookie = (await cookies()).get(AUTH_COOKIES.EMPLOYEE);
  if (tokenCookie) {
    token = tokenCookie.value;
  }

  // 2. Try Authorization header if cookie is missing
  if (!token) {
    const authHeader = (await headers()).get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return false;
  }

  const { isValid } = await verifySession(token, 'employee');
  return isValid;
}