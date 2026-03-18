import { cookies, headers } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getEmployeeById } from '@repo/database';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';

export type EmployeePayload = {
  employeeId: string;
  sessionId?: string;
};

async function getEmployeeToken() {
  let token: string | undefined;

  const tokenCookie = (await cookies()).get(AUTH_COOKIES.EMPLOYEE);
  if (tokenCookie) {
    token = tokenCookie.value;
  }

  if (!token) {
    const authHeader = (await headers()).get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  return token;
}

export async function getAuthenticatedEmployee() {
  const token = await getEmployeeToken();

  if (!token) {
    return null;
  }

  const { isValid, userId } = await verifySession(token, 'employee');

  if (!isValid || !userId) {
    return null;
  }

  return getEmployeeById(userId);
}

export async function getAuthenticatedEmployeeSession() {
  const token = await getEmployeeToken();

  if (!token) {
    return null;
  }

  const { isValid, userId } = await verifySession(token, 'employee');

  if (!isValid || !userId) {
    return null;
  }

  const decoded = jwt.decode(token) as EmployeePayload | null;
  if (!decoded?.sessionId) {
    return null;
  }

  return {
    employeeId: userId,
    sessionId: decoded.sessionId,
  };
}

/**
 * Lightweight session verification that favors Redis cache over DB.
 * Ideal for high-frequency polling.
 */
export async function verifyEmployeeSession() {
  const token = await getEmployeeToken();

  if (!token) {
    return false;
  }

  const { isValid } = await verifySession(token, 'employee');
  return isValid;
}
