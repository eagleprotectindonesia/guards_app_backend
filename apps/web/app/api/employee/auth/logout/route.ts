import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIES } from '@/lib/auth/constants';
import { getAuthenticatedEmployeeSession } from '@/lib/employee-auth';
import { revokeEmployeeSessionById } from '@/lib/auth/employee-sessions';
import { redis } from '@/lib/redis';

export async function POST() {
  try {
    const session = await getAuthenticatedEmployeeSession();
    if (session) {
      await revokeEmployeeSessionById(session.sessionId);
      try {
        await redis.xadd(
          `employee:stream:${session.employeeId}`,
          'MAXLEN',
          '~',
          100,
          '*',
          'type',
          'session_revoked',
          'reason',
          'logged_out',
          'sessionId',
          session.sessionId
        );
      } catch (error) {
        console.error('Failed to publish logout session revocation event:', error);
      }
    }

    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIES.EMPLOYEE);
    return NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error during employee logout:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
