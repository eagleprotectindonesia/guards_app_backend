import { db as prisma } from '../prisma/client';
import { ShiftStatus } from '@prisma/client';

export const SHIFT_REMINDER_WINDOW_MINUTES = 30;

export type ShiftReminderCandidate = {
  kind: 'onsite' | 'office';
  shiftId: string;
  employeeId: string;
  startsAt: Date;
  siteName?: string;
  shiftTypeName?: string;
  officeShiftTypeName?: string;
};

export async function getOnsiteShiftReminderCandidates(now: Date, leadMinutes = SHIFT_REMINDER_WINDOW_MINUTES) {
  const upperBound = new Date(now.getTime() + leadMinutes * 60_000);

  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      status: ShiftStatus.scheduled,
      employeeId: { not: null },
      reminderSentAt: null,
      startsAt: {
        gt: now,
        lte: upperBound,
      },
    },
    select: {
      id: true,
      employeeId: true,
      startsAt: true,
      site: { select: { name: true } },
      shiftType: { select: { name: true } },
    },
  });
}

export async function getOfficeShiftReminderCandidates(now: Date, leadMinutes = SHIFT_REMINDER_WINDOW_MINUTES) {
  const upperBound = new Date(now.getTime() + leadMinutes * 60_000);

  return prisma.officeShift.findMany({
    where: {
      deletedAt: null,
      status: ShiftStatus.scheduled,
      reminderSentAt: null,
      startsAt: {
        gt: now,
        lte: upperBound,
      },
    },
    select: {
      id: true,
      employeeId: true,
      startsAt: true,
      officeShiftType: { select: { name: true } },
    },
  });
}

export async function claimOnsiteShiftReminder(shiftId: string, sentAt: Date) {
  const result = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      reminderSentAt: null,
      deletedAt: null,
      status: ShiftStatus.scheduled,
    },
    data: { reminderSentAt: sentAt },
  });

  return result.count > 0;
}

export async function claimOfficeShiftReminder(officeShiftId: string, sentAt: Date) {
  const result = await prisma.officeShift.updateMany({
    where: {
      id: officeShiftId,
      reminderSentAt: null,
      deletedAt: null,
      status: ShiftStatus.scheduled,
    },
    data: { reminderSentAt: sentAt },
  });

  return result.count > 0;
}

export async function getOnsiteShiftEndReminderCandidates(now: Date) {
  return prisma.shift.findMany({
    where: {
      deletedAt: null,
      employeeId: { not: null },
      status: { in: [ShiftStatus.scheduled, ShiftStatus.in_progress] },
      endReminderSentAt: null,
      endsAt: { lte: now },
    },
    select: {
      id: true,
      employeeId: true,
      startsAt: true,
      endsAt: true,
      site: { select: { name: true } },
      shiftType: { select: { name: true } },
    },
  });
}

export async function getOfficeShiftEndReminderCandidates(now: Date) {
  return prisma.officeShift.findMany({
    where: {
      deletedAt: null,
      status: { in: [ShiftStatus.scheduled, ShiftStatus.in_progress] },
      endReminderSentAt: null,
      endsAt: { lte: now },
      officeAttendances: {
        some: { status: 'present' },
        none: { status: 'clocked_out' },
      },
    },
    select: {
      id: true,
      employeeId: true,
      startsAt: true,
      endsAt: true,
      officeShiftType: { select: { name: true } },
    },
  });
}

export async function claimOnsiteShiftEndReminder(shiftId: string, sentAt: Date) {
  const result = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      endReminderSentAt: null,
      deletedAt: null,
      status: { in: [ShiftStatus.scheduled, ShiftStatus.in_progress] },
    },
    data: { endReminderSentAt: sentAt },
  });

  return result.count > 0;
}

export async function claimOfficeShiftEndReminder(officeShiftId: string, sentAt: Date) {
  const result = await prisma.officeShift.updateMany({
    where: {
      id: officeShiftId,
      endReminderSentAt: null,
      deletedAt: null,
      status: { in: [ShiftStatus.scheduled, ShiftStatus.in_progress] },
    },
    data: { endReminderSentAt: sentAt },
  });

  return result.count > 0;
}
