import { db as prisma } from '../prisma/client';

/**
 * Gets all FCM tokens for an employee with active sessions.
 */
export async function getEmployeeFcmTokens(employeeId: string) {
  return prisma.fcmToken.findMany({
    where: {
      employeeSession: {
        employeeId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    },
    select: { token: true },
  });
}

/**
 * Upserts an FCM token for an employee session.
 */
export async function upsertEmployeeFcmToken(params: {
  token: string;
  employeeSessionId: string;
  deviceInfo?: string | null;
}) {
  const { token, employeeSessionId, deviceInfo } = params;

  return prisma.fcmToken.upsert({
    where: { token },
    update: {
      employeeSessionId,
      deviceInfo: deviceInfo ?? null,
      updatedAt: new Date(),
    },
    create: {
      token,
      employeeSessionId,
      deviceInfo: deviceInfo ?? null,
    },
  });
}

/**
 * Deletes an FCM token for an employee session.
 */
export async function deleteEmployeeFcmToken(params: {
  token: string;
  employeeSessionId: string;
}) {
  const { token, employeeSessionId } = params;

  const result = await prisma.fcmToken.deleteMany({
    where: {
      employeeSessionId,
      token,
    },
  });

  return { deleted: result.count > 0, count: result.count };
}

/**
 * Removes stale FCM tokens that failed to deliver.
 */
export async function removeStaleFcmTokens(tokens: string[]) {
  if (tokens.length === 0) {
    return { count: 0 };
  }

  const result = await prisma.fcmToken.deleteMany({
    where: { token: { in: tokens } },
  });

  return { count: result.count };
}
