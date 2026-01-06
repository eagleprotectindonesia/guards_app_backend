import { db as prisma } from "../client";
import { ShiftStatus, AlertResolution } from '@prisma/client';

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
            guard: true,
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
              guardId: alert.shift.guardId,
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
              guardId: alert.shift.guardId,
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
