import { cookies } from 'next/headers';
import { getEmployeeById } from '@/lib/data-access/employees';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';

export type EmployeePayload = {
  employeeId: string;
  tokenVersion?: number;
};

export async function getAuthenticatedEmployee() {
  const tokenCookie = (await cookies()).get(AUTH_COOKIES.EMPLOYEE);

  if (!tokenCookie) {
    return null;
  }

  const { isValid, userId } = await verifySession(tokenCookie.value, 'employee');

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
  const tokenCookie = (await cookies()).get(AUTH_COOKIES.EMPLOYEE);

  if (!tokenCookie) {
    return false;
  }

  const { isValid } = await verifySession(tokenCookie.value, 'employee');
  return isValid;
}