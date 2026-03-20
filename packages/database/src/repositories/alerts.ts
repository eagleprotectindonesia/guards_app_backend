import { db as prisma } from "../prisma/client";
import { ShiftStatus, AlertResolution, AlertReason, AlertSeverity } from '@prisma/client';

export async function getAlertById(id: string) {
  return prisma.alert.findUnique({
    where: { id },
    include: { shift: true },
  });
}

export async function resolveAlert(params: {
  id: string;
  adminId: string;
  outcome: 'forgive' | 'resolve';
  note: string;
}) {
  const { id, adminId, outcome, note } = params;

  return prisma.$transaction(async tx => {
    const alert = await tx.alert.findUnique({
      where: { id },
      include: { shift: true },
    });

    if (!alert) {
      throw new Error('Alert not found');
    }

    const resolutionType: AlertResolution = outcome === 'forgive' ? 'forgiven' : 'standard';

    const updatedAlert = await tx.alert.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedById: adminId,
        resolutionType,
        resolutionNote: note,
      },
      include: {
        site: true,
        resolverAdmin: true,
        ackAdmin: true,
        shift: {
          include: {
            employee: true,
            shiftType: true,
          },
        },
      },
    });

    if (outcome === 'forgive') {
      if (alert.reason === 'missed_checkin') {
        const updateData: { missedCount?: { decrement: number }; status?: ShiftStatus } = {};

        if (alert.shift.missedCount > 0) {
          updateData.missedCount = { decrement: 1 };
        }

        const intervalMs = alert.shift.requiredCheckinIntervalMins * 60000;
        const nextSlotStartMs = new Date(alert.windowStart).getTime() + intervalMs;

        if (nextSlotStartMs >= new Date(alert.shift.endsAt).getTime()) {
          updateData.status = 'completed';
        }

        if (Object.keys(updateData).length > 0) {
          await tx.shift.update({
            where: { id: alert.shiftId },
            data: updateData,
          });
        }
      } else if (alert.reason === 'missed_attendance') {
        const existingAttendance = await tx.attendance.findUnique({
          where: { shiftId: alert.shiftId },
        });

        if (!existingAttendance) {
          const newAttendance = await tx.attendance.create({
            data: {
              shiftId: alert.shiftId,
              employeeId: alert.shift.employeeId,
              recordedAt: new Date(),
              status: 'late',
              metadata: { note: 'Auto-created via alert forgiveness' },
            },
          });

          await tx.shift.update({
            where: { id: alert.shiftId },
            data: {
              attendance: { connect: { id: newAttendance.id } },
              status: alert.shift.status === 'scheduled' ? 'in_progress' : undefined,
            },
          });
        }
      }
    } else {
      // outcome === 'resolve' (standard)
      if (alert.reason === 'missed_attendance') {
        const existingAttendance = await tx.attendance.findUnique({
          where: { shiftId: alert.shiftId },
        });

        if (!existingAttendance) {
          await tx.attendance.create({
            data: {
              shiftId: alert.shiftId,
              employeeId: alert.shift.employeeId,
              recordedAt: new Date(),
              status: 'absent',
              metadata: { note: 'Auto-created via alert resolution (absent)' },
            },
          });

          await tx.shift.update({
            where: { id: alert.shiftId },
            data: {
              status: 'missed',
            },
          });
        }
      }
    }

    return updatedAlert;
  });
}

export async function autoResolveAlert(params: {
  shiftId: string;
  reason: AlertReason;
  tx?: any;
}) {
  const { shiftId, reason, tx } = params;
  const client = tx || prisma;

  // Find the most recent open alert for this shift and reason
  const alert = await client.alert.findFirst({
    where: {
      shiftId,
      reason,
      resolvedAt: null,
    },
    orderBy: {
      windowStart: 'desc',
    },
  });

  if (!alert) return null;

  return client.alert.update({
    where: { id: alert.id },
    data: {
      resolvedAt: new Date(),
      resolutionType: 'auto',
      resolutionNote: 'Auto-resolved by employee late action',
    },
    include: {
      site: true,
      resolverAdmin: true,
      ackAdmin: true,
      shift: {
        include: {
          employee: true,
          shiftType: true,
        },
      },
    },
  });
}

/**
 * Gets open alerts for the admin dashboard.
 * Optionally filtered by siteId.
 */
export async function getOpenAlertsForDashboard(siteId?: string) {
  return prisma.alert.findMany({
    where: {
      resolvedAt: null,
      ...(siteId ? { siteId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      site: true,
      shift: {
        include: {
          employee: true,
          shiftType: true,
        },
      },
    },
  });
}

/**
 * Checks if an open alert already exists for a given shift and reason.
 */
export async function findOpenAlertByShiftAndReason(shiftId: string, reason: AlertReason) {
  return prisma.alert.findFirst({
    where: {
      shiftId,
      reason,
      resolvedAt: null,
    },
    include: {
      site: true,
      shift: {
        include: {
          employee: true,
          shiftType: true,
        },
      },
    },
  });
}

/**
 * Creates a new alert.
 */
export async function createAlert(data: {
  shiftId: string;
  siteId: string;
  reason: AlertReason;
  severity?: AlertSeverity;
  windowStart?: Date;
}) {
  const now = new Date();

  return prisma.alert.create({
    data: {
      shiftId: data.shiftId,
      siteId: data.siteId,
      reason: data.reason,
      severity: data.severity ?? 'critical',
      windowStart: data.windowStart ?? now,
      createdAt: now,
    },
    include: {
      site: true,
      shift: {
        include: {
          employee: true,
          shiftType: true,
        },
      },
    },
  });
}

/**
 * Resolves open alerts for a given shift and reason.
 */
export async function resolveAlertsByShiftAndReason(params: {
  shiftId: string;
  reason: AlertReason;
  resolutionNote: string;
}) {
  const { shiftId, reason, resolutionNote } = params;
  const now = new Date();

  // Find alerts to resolve
  const alertsToResolve = await prisma.alert.findMany({
    where: {
      shiftId,
      reason,
      resolvedAt: null,
    },
  });

  if (alertsToResolve.length === 0) {
    return { resolvedAlerts: [], count: 0 };
  }

  // Resolve all alerts
  const updatedAlerts = await Promise.all(
    alertsToResolve.map((alert) =>
      prisma.alert.update({
        where: { id: alert.id },
        data: {
          resolvedAt: now,
          resolutionType: 'auto',
          resolutionNote,
        },
        include: {
          site: true,
          shift: {
            include: {
              employee: true,
              shiftType: true,
            },
          },
        },
      })
    )
  );

  return { resolvedAlerts: updatedAlerts, count: updatedAlerts.length };
}
