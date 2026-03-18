import { db as prisma } from '@repo/database';

export type EmployeeClientType = 'mobile' | 'pwa';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function getEmployeeSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

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

export async function revokeEmployeeSessions(employeeId: string, sessionIdsToKeep: string[] = []) {
  const now = new Date();

  return prisma.employeeSession.updateMany({
    where: {
      employeeId,
      revokedAt: null,
      expiresAt: { gt: now },
      ...(sessionIdsToKeep.length > 0 ? { id: { notIn: sessionIdsToKeep } } : {}),
    },
    data: {
      revokedAt: now,
    },
  });
}

export async function revokeEmployeeSessionById(sessionId: string) {
  const now = new Date();

  return prisma.employeeSession.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });
}

export async function isEmployeeSessionActive(sessionId: string) {
  const session = await prisma.employeeSession.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true },
  });

  return !!session && session.revokedAt === null && session.expiresAt > new Date();
}
