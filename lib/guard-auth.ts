import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export type GuardPayload = {
  guardId: string;
  tokenVersion?: number;
};

export async function getAuthenticatedGuard() {
  const tokenCookie = (await cookies()).get('guard_token');

  if (!tokenCookie) {
    return null;
  }

  try {
    const decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as GuardPayload;

    const guard = await prisma.guard.findUnique({
      where: { id: decoded.guardId },
    });

    if (!guard || guard.tokenVersion !== decoded.tokenVersion) {
      return null;
    }

    return guard;
  } catch (error) {
    // console.error('Guard auth error:', error);
    return null;
  }
}
