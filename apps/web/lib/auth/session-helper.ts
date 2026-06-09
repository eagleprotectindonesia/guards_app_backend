import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma, getEmployeeSessionExpiry } from '@repo/database';
import { redis } from '@repo/database/redis';
import { AUTH_COOKIES, AUTH_COOKIE_SECURE, getJwtSecret } from '@/lib/auth/constants';

interface CreateSessionOptions {
  employeeId: string;
  clientType: 'mobile' | 'pwa';
  deviceInfo: string;
}

export async function createEmployeeSession({
  employeeId,
  clientType,
  deviceInfo,
}: CreateSessionOptions) {
  const expiresAt = getEmployeeSessionExpiry();

  const session = await prisma.$transaction(async (tx) => {
    await tx.employeeSession.updateMany({
      where: {
        employeeId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return tx.employeeSession.create({
      data: {
        employeeId,
        clientType,
        deviceInfo,
        expiresAt,
      },
    });
  });

  try {
    await redis.xadd(
      `employee:stream:${employeeId}`,
      'MAXLEN',
      '~',
      100,
      '*',
      'type',
      'session_revoked',
      'reason',
      'logged_in_elsewhere',
      'sessionId',
      session.id
    );
  } catch (error) {
    console.error('Failed to publish session revocation event:', error);
  }

  const token = jwt.sign(
    {
      employeeId,
      sessionId: session.id,
      clientType,
    },
    getJwtSecret(),
    { expiresIn: '1d' }
  );

  (await cookies()).set(AUTH_COOKIES.EMPLOYEE, token, {
    httpOnly: true,
    secure: AUTH_COOKIE_SECURE,
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  return { token, session };
}

export async function refreshEmployeeSession(
  sessionId: string,
  employeeId: string,
  clientType: 'mobile' | 'pwa'
) {
  const expiresAt = getEmployeeSessionExpiry();

  await prisma.employeeSession.update({
    where: { id: sessionId },
    data: { expiresAt },
  });

  const token = jwt.sign(
    {
      employeeId,
      sessionId,
      clientType,
    },
    getJwtSecret(),
    { expiresIn: '1d' }
  );

  return token;
}

