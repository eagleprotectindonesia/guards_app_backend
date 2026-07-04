'use server';

import { prisma, updateGroupShift, addGroupMembers, findGroupChatByGroupShiftId } from '@repo/database';
import { createShiftWithChangelog, deleteShiftWithChangelog } from '@repo/database';
import { revalidatePath } from 'next/cache';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { subMinutes } from 'date-fns';

export async function updateGroupShiftAction(id: string, data: { clientName?: string; note?: string }) {
  const adminId = await getAdminIdFromToken();
  if (!adminId) throw new Error('Unauthorized');

  await updateGroupShift(id, data);
  revalidatePath(`/admin/guard-shifts/group-shifts/${id}`);
  revalidatePath('/admin/guard-shifts/group-shifts');
}

export async function addGuardToGroupAction(groupShiftId: string, employeeId: string) {
  const adminId = await getAdminIdFromToken();
  if (!adminId) throw new Error('Unauthorized');

  const groupShift = await prisma.groupShift.findUnique({
    where: { id: groupShiftId },
    include: { shifts: { where: { deletedAt: null }, take: 1 } },
  });

  if (!groupShift) throw new Error('Group shift not found');

  const referenceShift = groupShift.shifts[0];
  if (!referenceShift) throw new Error('Group shift has no reference shift');

  const ref = await prisma.shift.findUnique({
    where: { id: referenceShift.id },
    select: {
      siteId: true,
      shiftTypeId: true,
      kind: true,
      escortEndSiteId: true,
      date: true,
      startsAt: true,
      endsAt: true,
      requiredCheckinIntervalMins: true,
      graceMinutes: true,
      note: true,
    },
  });

  if (!ref) throw new Error('Reference shift not found');

  await createShiftWithChangelog(
    {
      site: { connect: { id: ref.siteId } },
      shiftType: { connect: { id: ref.shiftTypeId } },
      employee: { connect: { id: employeeId } },
      kind: ref.kind,
      escortEndSite: ref.escortEndSiteId ? { connect: { id: ref.escortEndSiteId } } : undefined,
      date: ref.date,
      startsAt: ref.startsAt,
      endsAt: ref.endsAt,
      requiredCheckinIntervalMins: ref.requiredCheckinIntervalMins,
      graceMinutes: ref.graceMinutes,
      note: ref.note || undefined,
      status: 'scheduled',
      groupShift: { connect: { id: groupShiftId } },
    },
    adminId
  );

  // Sync to group chat
  const groupChat = await findGroupChatByGroupShiftId(groupShiftId);
  if (groupChat) {
    const visibleFromAt = subMinutes(ref.startsAt, 30);
    await addGroupMembers({
      groupId: groupChat.id,
      actor: { participantType: 'admin', adminId },
      employeeIds: [employeeId],
      visibleFromAt,
    });
  }

  revalidatePath(`/admin/guard-shifts/group-shifts/${groupShiftId}`);
  revalidatePath('/admin/guard-shifts/group-shifts');
}

export async function removeGuardFromGroupAction(groupShiftId: string, shiftId: string) {
  const adminId = await getAdminIdFromToken();
  if (!adminId) throw new Error('Unauthorized');

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId, deletedAt: null },
    select: { status: true, employeeId: true, groupShiftId: true },
  });

  if (!shift) throw new Error('Shift not found');
  if (shift.groupShiftId !== groupShiftId) throw new Error('Shift does not belong to this group');
  if (shift.status !== 'scheduled') throw new Error('Only scheduled shifts can be removed');

  // Remove from group chat
  if (shift.employeeId) {
    const groupChat = await findGroupChatByGroupShiftId(groupShiftId);
    if (groupChat) {
      const participant = groupChat.participants.find(
        p => p.employeeId === shift.employeeId && p.status === 'active'
      );
      if (participant) {
        const { removeGroupMember } = await import('@repo/database');
        await removeGroupMember({
          groupId: groupChat.id,
          actor: { participantType: 'admin', adminId },
          participantId: participant.id,
        });
      }
    }
  }

  await deleteShiftWithChangelog(shiftId, adminId);

  revalidatePath(`/admin/guard-shifts/group-shifts/${groupShiftId}`);
  revalidatePath('/admin/guard-shifts/group-shifts');
}
