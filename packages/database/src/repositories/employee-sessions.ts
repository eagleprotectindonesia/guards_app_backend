import { db as prisma } from '../prisma/client';

export type EmployeeClientType = 'mobile' | 'pwa';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Calculates the session expiry date (24 hours from now by default).
 */
export function getEmployeeSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/**
 * Creates a new employee session.
 */
export async function createEmployeeSession(params: {
  employeeId: string;
  clientType: EmployeeClientType;
  deviceInfo?: string | null;
  expiresAt?: Date;
}) {
  const { employeeId, clientType, deviceInfo, expiresAt = getEmployeeSessionExpiry() } = params;

  return prisma.employeeSession.create({
    data: {
      employeeId,
      clientType,
      deviceInfo: deviceInfo ?? null,
      expiresAt,
    },
  });
}

/**
 * Revokes a specific employee session by ID.
 * Used for logout.
 */
export async function revokeEmployeeSessionById(sessionId: string) {
  const now = new Date();

  await prisma.employeeSession.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });
}

/**
 * Checks if a specific employee session is still active.
 */
export async function isEmployeeSessionActive(sessionId: string) {
  const session = await prisma.employeeSession.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true },
  });

  return !!session && session.revokedAt === null && session.expiresAt > new Date();
}
