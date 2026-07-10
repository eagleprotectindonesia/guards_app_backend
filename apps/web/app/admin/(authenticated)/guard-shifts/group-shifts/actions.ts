'use server';

import { prisma, updateGroupShift, addGroupMembers, findGroupChatByGroupShiftId, updateSiteWithChangelog, deleteGroupShiftIfOrphaned } from '@repo/database';
import { createShiftWithChangelog, deleteShiftWithChangelog } from '@repo/database';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { subMinutes } from 'date-fns';

export async function updateGroupShiftAction(
  id: string,
  data: {
    clientName?: string;
    note?: string;
    startAddress?: string;
    startLat?: number;
    startLng?: number;
    endAddress?: string;
    endLat?: number;
    endLng?: number;
  }
) {
  const { id: adminId } = await requirePermission(PERMISSIONS.SHIFTS.EDIT);

  // Update site addresses when provided
  const groupShift = await prisma.groupShift.findUnique({ where: { id }, select: { siteId: true, endSiteId: true } });
  if (!groupShift) throw new Error('Group shift not found');

  if (groupShift.siteId && data.startAddress && data.startLat != null && data.startLng != null) {
    const baseName = data.clientName?.trim()
      ? `Site: ${data.clientName.trim()}`
      : `Site: ${data.startAddress.substring(0, 30)}`;
    let siteName = baseName;
    let counter = 1;
    while (await prisma.site.findFirst({ where: { name: siteName, id: { not: groupShift.siteId } } })) {
      siteName = `${baseName} (${counter})`;
      counter++;
    }
    await updateSiteWithChangelog(
      groupShift.siteId,
      {
        address: data.startAddress,
        latitude: data.startLat,
        longitude: data.startLng,
        name: siteName,
        clientName: data.clientName || '',
      },
      adminId
    );
  }

  if (groupShift.endSiteId && data.endAddress && data.endLat != null && data.endLng != null) {
    const baseName = data.clientName?.trim()
      ? `Escort: ${data.clientName.trim()}`
      : `Escort: ${data.endAddress.substring(0, 30)}`;
    let siteName = baseName;
    let counter = 1;
    while (await prisma.site.findFirst({ where: { name: siteName, id: { not: groupShift.endSiteId } } })) {
      siteName = `${baseName} (${counter})`;
      counter++;
    }
    await updateSiteWithChangelog(
      groupShift.endSiteId,
      {
        address: data.endAddress,
        latitude: data.endLat,
        longitude: data.endLng,
        name: siteName,
        clientName: data.clientName || '',
      },
      adminId
    );
  }

  await updateGroupShift(id, { clientName: data.clientName, note: data.note });
  revalidatePath(`/admin/guard-shifts/group-shifts/${id}`);
  revalidatePath('/admin/guard-shifts/group-shifts');
}

export async function addGuardToGroupAction(groupShiftId: string, employeeId: string) {
  const { id: adminId } = await requirePermission(PERMISSIONS.SHIFTS.CREATE);

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
      status: true,
    },
  });

  if (!ref) throw new Error('Reference shift not found');
  if (ref.status !== 'scheduled') throw new Error('Cannot add guards to an ongoing group shift');

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
  const { id: adminId } = await requirePermission(PERMISSIONS.SHIFTS.DELETE);

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

  await deleteGroupShiftIfOrphaned(groupShiftId);

  revalidatePath(`/admin/guard-shifts/group-shifts/${groupShiftId}`);
  revalidatePath('/admin/guard-shifts/group-shifts');
}
