import { ChatMessageStatus, GroupChatParticipantStatus, GroupChatParticipantType, Prisma } from '@prisma/client';
import { db } from '../prisma/client';

const GROUP_CHAT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type Actor =
  | { participantType: 'admin'; adminId: string }
  | { participantType: 'employee'; employeeId: string };

function actorAdminId(actor: Actor): string | undefined {
  return actor.participantType === 'admin' ? actor.adminId : undefined;
}

function actorEmployeeId(actor: Actor): string | undefined {
  return actor.participantType === 'employee' ? actor.employeeId : undefined;
}

function sentGroupMessageWhere(where: Prisma.GroupChatMessageWhereInput = {}): Prisma.GroupChatMessageWhereInput {
  return { ...where, status: ChatMessageStatus.sent };
}

async function getActiveParticipantForActor(tx: Prisma.TransactionClient, groupId: string, actor: Actor) {
  return tx.groupChatParticipant.findFirst({
    where: {
      groupId,
      status: GroupChatParticipantStatus.active,
      participantType: actor.participantType,
      adminId: actorAdminId(actor),
      employeeId: actorEmployeeId(actor),
    },
  });
}

async function assertOwner(tx: Prisma.TransactionClient, groupId: string, actor: Actor) {
  const participant = await getActiveParticipantForActor(tx, groupId, actor);
  if (!participant) throw new Error('Active group participant not found');
  if (participant.role !== 'owner') throw new Error('Only group owner can perform this action');
  return participant;
}

async function assertCanManageMembers(tx: Prisma.TransactionClient, groupId: string, actor: Actor) {
  const participant = await getActiveParticipantForActor(tx, groupId, actor);
  if (!participant) throw new Error('Active group participant not found');
  if (participant.role === 'owner' || participant.role === 'admin') return participant;
  throw new Error('Only group owner or admin can manage members');
}

async function syncGroupConversation(tx: Prisma.TransactionClient, groupId: string, message: { content: string; senderName: string; createdAt: Date }) {
  await tx.groupChat.update({
    where: { id: groupId },
    data: {
      lastMessageAt: message.createdAt,
      lastMessageContent: message.content,
      lastMessageSenderName: message.senderName,
    },
  });
}

async function resolveParticipantSenderName(tx: Prisma.TransactionClient, participant: { participantType: GroupChatParticipantType; adminId?: string | null; employeeId?: string | null }) {
  if (participant.participantType === GroupChatParticipantType.admin) {
    if (!participant.adminId) return 'Unknown Admin';
    const admin = await tx.admin.findUnique({
      where: { id: participant.adminId },
      select: { name: true },
    });
    return admin?.name ?? 'Unknown Admin';
  }

  if (!participant.employeeId) return 'Unknown Employee';
  const employee = await tx.employee.findUnique({
    where: { id: participant.employeeId },
    select: { fullName: true },
  });
  return employee?.fullName ?? 'Unknown Employee';
}

async function resolveSenderEmployeeNumber(tx: Prisma.TransactionClient, employeeId?: string | null) {
  if (!employeeId) return null;
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { employeeNumber: true },
  });
  return employee?.employeeNumber ?? null;
}

export async function createGroupChat(params: {
  title: string;
  description?: string | null;
  groupShiftId?: string | null;
  creator: Actor;
  employeeIds?: string[];
  leadEmployeeId?: string | null;
  adminIds?: string[];
  adminRole?: 'admin' | 'member';
  visibleFromAt?: Date;
}) {
  const title = params.title.trim();
  if (!title) throw new Error('Group title is required');

  const visibleFrom = params.visibleFromAt ?? new Date();

  return db.$transaction(async tx => {
    const group = await tx.groupChat.create({
      data: {
        title,
        description: params.description ?? null,
        groupShiftId: params.groupShiftId ?? null,
        createdByAdminId: actorAdminId(params.creator) ?? null,
        createdByEmployeeId: actorEmployeeId(params.creator) ?? null,
      },
    });

    const owner = await tx.groupChatParticipant.create({
      data: {
        groupId: group.id,
        participantType: params.creator.participantType,
        adminId: actorAdminId(params.creator) ?? null,
        employeeId: actorEmployeeId(params.creator) ?? null,
        role: 'owner',
        status: 'active',
        visibleFromAt: visibleFrom,
      },
    });

    const uniqueEmployeeIds = Array.from(new Set(params.employeeIds ?? [])).filter(Boolean);
    const leadId = params.leadEmployeeId ?? null;
    const uniqueAdminIds = Array.from(new Set(params.adminIds ?? [])).filter(Boolean);
    const creatorEmployeeId = actorEmployeeId(params.creator) ?? null;
    const creatorAdminId = actorAdminId(params.creator) ?? null;

    if (uniqueEmployeeIds.length > 0) {
      const memberIds = uniqueEmployeeIds.filter(eid => eid !== creatorEmployeeId && eid !== leadId);
      if (memberIds.length > 0) {
        await tx.groupChatParticipant.createMany({
          data: memberIds.map(employeeId => ({
            groupId: group.id,
            participantType: GroupChatParticipantType.employee,
            employeeId,
            role: 'member',
            status: 'active',
            visibleFromAt: visibleFrom,
          })),
        });
      }
    }

    if (leadId && !uniqueEmployeeIds.includes(leadId)) {
      throw new Error('Lead guard must be a selected employee.');
    }

    if (leadId && leadId !== creatorEmployeeId) {
      await tx.groupChatParticipant.create({
        data: {
          groupId: group.id,
          participantType: GroupChatParticipantType.employee,
          employeeId: leadId,
          role: 'lead',
          status: 'active',
          visibleFromAt: visibleFrom,
        },
      });
    }

    if (uniqueAdminIds.length > 0) {
      await tx.groupChatParticipant.createMany({
        data: uniqueAdminIds
          .filter(adminId => adminId !== creatorAdminId)
          .map(adminId => ({
            groupId: group.id,
            participantType: GroupChatParticipantType.admin,
            adminId,
            role: params.adminRole ?? 'member',
            status: 'active',
            visibleFromAt: visibleFrom,
          })),
      });
    }

    await tx.groupChatMembershipEvent.create({
      data: {
        groupId: group.id,
        actorParticipantId: owner.id,
        targetParticipantId: owner.id,
        type: 'created',
      },
    });

    return group;
  });
}

export async function getGroupChatForParticipant(params: { groupId: string; actor: Actor }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) return null;
    if (participant.visibleFromAt > new Date()) return null;
    return tx.groupChat.findUnique({ where: { id: params.groupId } });
  });
}

export async function getActiveGroupParticipant(params: { groupId: string; actor: Actor }) {
  return db.$transaction(async tx => getActiveParticipantForActor(tx, params.groupId, params.actor));
}

export async function listActiveGroupIdsForParticipant(params: { actor: Actor }) {
  const now = new Date();
  const rows = await db.groupChatParticipant.findMany({
    where: {
      status: GroupChatParticipantStatus.active,
      visibleFromAt: { lte: now },
      participantType: params.actor.participantType,
      adminId: actorAdminId(params.actor),
      employeeId: actorEmployeeId(params.actor),
    },
    select: { groupId: true },
  });
  return rows.map(row => row.groupId);
}

export async function updateGroupChat(params: {
  groupId: string;
  actor: Actor;
  title?: string;
  description?: string | null;
}) {
  return db.$transaction(async tx => {
    await assertOwner(tx, params.groupId, params.actor);
    return tx.groupChat.update({
      where: { id: params.groupId },
      data: {
        title: params.title,
        description: params.description,
      },
    });
  });
}

export async function getGroupChatListForParticipant(params: {
  actor: Actor;
  limit?: number;
  cursor?: Date;
  view?: 'inbox' | 'unread' | 'archived';
  search?: string;
}) {
  const limit = params.limit ?? 20;
  const view = params.view ?? 'inbox';
  const search = params.search?.trim();
  const rows = await db.groupChatParticipant.findMany({
    where: {
      status: GroupChatParticipantStatus.active,
      visibleFromAt: { lte: new Date() },
      participantType: params.actor.participantType,
      adminId: actorAdminId(params.actor),
      employeeId: actorEmployeeId(params.actor),
      isArchived: view === 'archived' ? true : false,
      unreadCount: view === 'unread' ? { gt: 0 } : undefined,
      group: params.cursor ? { lastMessageAt: { lt: params.cursor } } : undefined,
      ...(search
        ? {
            group: {
              ...(params.cursor ? { lastMessageAt: { lt: params.cursor } } : {}),
              OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }],
            },
          }
        : {}),
    },
    include: { group: true },
    orderBy: [{ group: { lastMessageAt: 'desc' } }, { groupId: 'desc' }],
    take: limit + 1,
  });

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;
  return {
    groups: page.map(row => ({ participant: row, group: row.group })),
    nextCursor: hasNext ? page[page.length - 1].group.lastMessageAt : null,
  };
}

export async function setGroupChatArchiveState(params: { groupId: string; actor: Actor; isArchived: boolean }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');
    return tx.groupChatParticipant.update({
      where: { id: participant.id },
      data: {
        isArchived: params.isArchived,
        isMuted: params.isArchived,
      },
    });
  });
}

export async function addGroupMembers(params: { groupId: string; actor: Actor; employeeIds?: string[]; adminIds?: string[]; visibleFromAt?: Date }) {
  const employeeIds = params.employeeIds ?? [];
  const adminIds = params.adminIds ?? [];
  if (employeeIds.length === 0 && adminIds.length === 0) return [];

  const visibleFrom = params.visibleFromAt ?? new Date();

  return db.$transaction(async tx => {
    await assertCanManageMembers(tx, params.groupId, params.actor);

    const uniqueEmployeeIds = Array.from(new Set(employeeIds)).filter(Boolean);
    const uniqueAdminIds = Array.from(new Set(adminIds)).filter(Boolean);
    const allExisting = await tx.groupChatParticipant.findMany({
      where: {
        groupId: params.groupId,
        OR: [
          uniqueEmployeeIds.length > 0
            ? { participantType: GroupChatParticipantType.employee, employeeId: { in: uniqueEmployeeIds } }
            : undefined,
          uniqueAdminIds.length > 0 ? { participantType: GroupChatParticipantType.admin, adminId: { in: uniqueAdminIds } } : undefined,
        ].filter(Boolean) as Prisma.GroupChatParticipantWhereInput[],
      },
      select: { id: true, participantType: true, employeeId: true, adminId: true, status: true },
    });

    const activeEmployeeIds = new Set(
      allExisting
        .filter(item => item.participantType === GroupChatParticipantType.employee && item.status === 'active')
        .map(item => item.employeeId)
        .filter(Boolean) as string[]
    );
    const activeAdminIds = new Set(
      allExisting
        .filter(item => item.participantType === GroupChatParticipantType.admin && item.status === 'active')
        .map(item => item.adminId)
        .filter(Boolean) as string[]
    );

    const now = new Date();
    const reactivated: string[] = [];

    const inactiveParticipants = allExisting.filter(item => item.status !== 'active');
    for (const participant of inactiveParticipants) {
      await tx.groupChatParticipant.update({
        where: { id: participant.id },
        data: { status: 'active', leftAt: null, removedAt: null, removedByParticipantId: null, visibleFromAt: visibleFrom, joinedAt: now },
      });
      reactivated.push(participant.id);
    }

    const employeeToCreate = uniqueEmployeeIds.filter(id => !activeEmployeeIds.has(id) && !inactiveParticipants.some(p => p.employeeId === id));
    const adminToCreate = uniqueAdminIds.filter(id => !activeAdminIds.has(id) && !inactiveParticipants.some(p => p.adminId === id));
    if (employeeToCreate.length === 0 && adminToCreate.length === 0) {
      if (reactivated.length > 0) {
        return tx.groupChatParticipant.findMany({
          where: { groupId: params.groupId, id: { in: reactivated } },
        });
      }
      return [];
    }

    await tx.groupChatParticipant.createMany({
      data: [
        ...employeeToCreate.map(employeeId => ({
          groupId: params.groupId,
          participantType: GroupChatParticipantType.employee,
          employeeId,
          role: 'member' as const,
          status: 'active' as const,
          visibleFromAt: visibleFrom,
        })),
        ...adminToCreate.map(adminId => ({
          groupId: params.groupId,
          participantType: GroupChatParticipantType.admin,
          adminId,
          role: 'member' as const,
          status: 'active' as const,
          visibleFromAt: visibleFrom,
        })),
      ],
    });

    return tx.groupChatParticipant.findMany({
      where: {
        groupId: params.groupId,
        status: 'active',
        OR: [
          employeeToCreate.length > 0
            ? { participantType: GroupChatParticipantType.employee, employeeId: { in: employeeToCreate } }
            : undefined,
          adminToCreate.length > 0 ? { participantType: GroupChatParticipantType.admin, adminId: { in: adminToCreate } } : undefined,
        ].filter(Boolean) as Prisma.GroupChatParticipantWhereInput[],
      },
    });
  });
}

export async function listGroupMembers(params: { groupId: string; actor: Actor }) {
  return db.$transaction(async tx => {
    const actorParticipant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!actorParticipant) throw new Error('Active group participant not found');

    const participants = await tx.groupChatParticipant.findMany({
      where: { groupId: params.groupId, status: GroupChatParticipantStatus.active },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const adminIds = Array.from(
      new Set(
        participants
          .filter(item => item.participantType === GroupChatParticipantType.admin)
          .map(item => item.adminId)
          .filter(Boolean) as string[]
      )
    );
    const employeeIds = Array.from(
      new Set(
        participants
          .filter(item => item.participantType === GroupChatParticipantType.employee)
          .map(item => item.employeeId)
          .filter(Boolean) as string[]
      )
    );

    const [admins, employees] = await Promise.all([
      adminIds.length > 0
        ? tx.admin.findMany({
            where: { id: { in: adminIds }, deletedAt: null },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
      employeeIds.length > 0
        ? tx.employee.findMany({
            where: { id: { in: employeeIds }, deletedAt: null },
            select: { id: true, fullName: true, employeeNumber: true },
          })
        : Promise.resolve([]),
    ]);

    const adminMap = new Map(admins.map(admin => [admin.id, admin]));
    const employeeMap = new Map(employees.map(employee => [employee.id, employee]));

    return participants.map(participant => {
      if (participant.participantType === GroupChatParticipantType.admin && participant.adminId) {
        const admin = adminMap.get(participant.adminId);
        return {
          ...participant,
          displayName: admin?.name ?? 'Unknown Admin',
          displayEmail: admin?.email ?? null,
          displayEmployeeNumber: null,
        };
      }

      if (participant.participantType === GroupChatParticipantType.employee && participant.employeeId) {
        const employee = employeeMap.get(participant.employeeId);
        return {
          ...participant,
          displayName: employee?.fullName ?? 'Unknown Employee',
          displayEmail: null,
          displayEmployeeNumber: employee?.employeeNumber ?? null,
        };
      }

      return {
        ...participant,
        displayName: 'Unknown Participant',
        displayEmail: null,
        displayEmployeeNumber: null,
      };
    });
  });
}

export async function removeGroupMember(params: { groupId: string; actor: Actor; participantId: string }) {
  return db.$transaction(async tx => {
    const owner = await assertCanManageMembers(tx, params.groupId, params.actor);
    const target = await tx.groupChatParticipant.findUnique({ where: { id: params.participantId } });
    if (!target || target.groupId !== params.groupId) throw new Error('Group participant not found');
    if (target.role === 'owner') throw new Error('Owner cannot be removed');
    const now = new Date();
    return tx.groupChatParticipant.update({
      where: { id: target.id },
      data: { status: 'removed', removedAt: now, leftAt: now, removedByParticipantId: owner.id },
    });
  });
}

export async function disbandGroup(params: { groupId: string; actor: Actor }) {
  return db.$transaction(async tx => {
    const owner = await assertOwner(tx, params.groupId, params.actor);
    const now = new Date();

    const group = await tx.groupChat.update({
      where: { id: params.groupId },
      data: { archivedAt: now },
      select: { id: true, archivedAt: true },
    });

    await tx.groupChatParticipant.updateMany({
      where: { groupId: params.groupId, status: GroupChatParticipantStatus.active },
      data: {
        status: GroupChatParticipantStatus.removed,
        removedAt: now,
        leftAt: now,
        removedByParticipantId: owner.id,
      },
    });

    await tx.groupChatMembershipEvent.create({
      data: {
        groupId: params.groupId,
        actorParticipantId: owner.id,
        targetParticipantId: owner.id,
        type: 'group_archived',
        metadata: { reason: 'disbanded_by_owner' },
      },
    });

    return group;
  });
}

export async function transferOwnershipIfNeeded(params: { groupId: string; tx?: Prisma.TransactionClient }) {
  const run = async (tx: Prisma.TransactionClient) => {
    const hasOwner = await tx.groupChatParticipant.findFirst({
      where: { groupId: params.groupId, status: 'active', role: 'owner' },
    });
    if (hasOwner) return hasOwner;
    const nextOwner = await tx.groupChatParticipant.findFirst({
      where: { groupId: params.groupId, status: 'active' },
      orderBy: { joinedAt: 'asc' },
    });
    if (!nextOwner) {
      await tx.groupChat.update({ where: { id: params.groupId }, data: { archivedAt: new Date() } });
      return null;
    }
    return tx.groupChatParticipant.update({ where: { id: nextOwner.id }, data: { role: 'owner' } });
  };
  return params.tx ? run(params.tx) : db.$transaction(run);
}

export async function leaveGroup(params: { groupId: string; actor: Actor }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');

    if (participant.role === 'owner' && participant.participantType === GroupChatParticipantType.admin) {
      const nextAdminOwner = await tx.groupChatParticipant.findFirst({
        where: {
          groupId: params.groupId,
          status: GroupChatParticipantStatus.active,
          participantType: GroupChatParticipantType.admin,
          id: { not: participant.id },
        },
        orderBy: { joinedAt: 'asc' },
      });
      if (!nextAdminOwner) {
        throw new Error('Owner cannot leave without another active admin');
      }
    }

    const now = new Date();
    const left = await tx.groupChatParticipant.update({
      where: { id: participant.id },
      data: { status: 'left', leftAt: now },
    });
    if (participant.role === 'owner') {
      await transferOwnershipIfNeeded({ groupId: params.groupId, tx });
    } else {
      const activeCount = await tx.groupChatParticipant.count({
        where: { groupId: params.groupId, status: 'active' },
      });
      if (activeCount === 0) {
        await tx.groupChat.update({ where: { id: params.groupId }, data: { archivedAt: new Date() } });
      }
    }
    return left;
  });
}

export async function findGroupChatByGroupShiftId(groupShiftId: string) {
  return db.groupChat.findFirst({
    where: { groupShiftId },
    include: { participants: true },
  });
}

export async function unarchiveGroupChat(groupId: string) {
  return db.groupChat.update({
    where: { id: groupId },
    data: { archivedAt: null },
  });
}

export async function archiveExpiredGroupChats() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const groups = await db.groupChat.findMany({
    where: {
      groupShiftId: { not: null },
      archivedAt: null,
      groupShift: { date: { lt: cutoff } },
    },
    select: { id: true },
  });

  if (groups.length === 0) return 0;

  await db.groupChat.updateMany({
    where: { id: { in: groups.map(g => g.id) } },
    data: { archivedAt: now },
  });

  return groups.length;
}

export async function reserveGroupMessageDraft(params: { groupId: string; actor: Actor }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');
    const senderName = await resolveParticipantSenderName(tx, participant);
    const senderEmployeeNumber = await resolveSenderEmployeeNumber(tx, participant.employeeId);
    const message = await tx.groupChatMessage.create({
      data: {
        groupId: params.groupId,
        senderParticipantId: participant.id,
        senderType: participant.participantType,
        adminId: participant.adminId,
        employeeId: participant.employeeId,
        senderName,
        status: ChatMessageStatus.draft,
        content: '',
        attachments: [],
        draftExpiresAt: new Date(Date.now() + GROUP_CHAT_DRAFT_TTL_MS),
      },
    });
    return { ...message, senderEmployeeNumber };
  });
}

export async function finalizeGroupMessageDraft(params: {
  groupId: string;
  messageId: string;
  actor: Actor;
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');
    const senderName = await resolveParticipantSenderName(tx, participant);
    const draft = await tx.groupChatMessage.findUnique({ where: { id: params.messageId } });
    if (!draft || draft.groupId !== params.groupId) throw new Error('Group draft not found');
    if (draft.senderParticipantId !== participant.id) throw new Error('Group draft does not belong to sender');
    if (draft.status === ChatMessageStatus.sent) throw new Error('Group draft already finalized');
    if (draft.status === ChatMessageStatus.expired || (draft.draftExpiresAt && draft.draftExpiresAt <= new Date())) {
      await tx.groupChatMessage.update({ where: { id: draft.id }, data: { status: ChatMessageStatus.expired } });
      throw new Error('Group draft has expired');
    }
    const now = new Date();
    const senderEmployeeNumber = await resolveSenderEmployeeNumber(tx, participant.employeeId);
    const message = await tx.groupChatMessage.update({
      where: { id: draft.id },
      data: {
        senderName,
        content: params.content,
        attachments: params.attachments ?? [],
        latitude: params.latitude,
        longitude: params.longitude,
        createdAt: now,
        status: ChatMessageStatus.sent,
        sentAt: now,
        draftExpiresAt: null,
      },
    });
    await syncGroupConversation(tx, params.groupId, { content: message.content, senderName: message.senderName, createdAt: message.createdAt });
    await tx.groupChatParticipant.updateMany({
      where: { groupId: params.groupId, status: 'active', id: { not: participant.id } },
      data: { unreadCount: { increment: 1 } },
    });
    return { ...message, senderEmployeeNumber };
  });
}

export async function saveGroupMessage(params: {
  groupId: string;
  actor: Actor;
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');
    const senderName = await resolveParticipantSenderName(tx, participant);
    const now = new Date();
    const senderEmployeeNumber = await resolveSenderEmployeeNumber(tx, participant.employeeId);
    const message = await tx.groupChatMessage.create({
      data: {
        groupId: params.groupId,
        senderParticipantId: participant.id,
        senderType: participant.participantType,
        adminId: participant.adminId,
        employeeId: participant.employeeId,
        senderName,
        status: ChatMessageStatus.sent,
        content: params.content,
        attachments: params.attachments ?? [],
        latitude: params.latitude,
        longitude: params.longitude,
        sentAt: now,
      },
    });
    await syncGroupConversation(tx, params.groupId, { content: message.content, senderName: message.senderName, createdAt: message.createdAt });
    await tx.groupChatParticipant.updateMany({
      where: { groupId: params.groupId, status: 'active', id: { not: participant.id } },
      data: { unreadCount: { increment: 1 } },
    });
    return { ...message, senderEmployeeNumber };
  });
}

export async function getGroupMessages(params: { groupId: string; actor: Actor; limit?: number; cursorId?: string }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) return [];
    const messages = await tx.groupChatMessage.findMany({
      where: sentGroupMessageWhere({
        groupId: params.groupId,
        createdAt: {
          gte: participant.visibleFromAt,
          lte: participant.leftAt ?? undefined,
        },
      }),
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
      skip: params.cursorId ? 1 : 0,
      cursor: params.cursorId ? { id: params.cursorId } : undefined,
    });
    const employeeIds = Array.from(new Set(messages.map(message => message.employeeId).filter(Boolean) as string[]));
    const employees =
      employeeIds.length > 0
        ? await tx.employee.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, employeeNumber: true },
          })
        : [];
    const employeeNumberById = new Map(employees.map(employee => [employee.id, employee.employeeNumber]));
    return messages.map(message => ({
      ...message,
      senderEmployeeNumber: message.employeeId ? (employeeNumberById.get(message.employeeId) ?? null) : null,
    }));
  });
}

export async function getGroupMessagesSince(params: { groupId: string; actor: Actor; since: Date }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) return [];
    const messages = await tx.groupChatMessage.findMany({
      where: sentGroupMessageWhere({
        groupId: params.groupId,
        createdAt: {
          gt: params.since,
          gte: participant.visibleFromAt,
          lte: participant.leftAt ?? undefined,
        },
      }),
      orderBy: { createdAt: 'asc' },
    });
    const employeeIds = Array.from(new Set(messages.map(message => message.employeeId).filter(Boolean) as string[]));
    const employees =
      employeeIds.length > 0
        ? await tx.employee.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, employeeNumber: true },
          })
        : [];
    const employeeNumberById = new Map(employees.map(employee => [employee.id, employee.employeeNumber]));
    return messages.map(message => ({
      ...message,
      senderEmployeeNumber: message.employeeId ? (employeeNumberById.get(message.employeeId) ?? null) : null,
    }));
  });
}

export async function markGroupAsRead(params: { groupId: string; actor: Actor; messageIds?: string[] }) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');
    const now = new Date();
    await tx.groupChatParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: now, unreadCount: 0 },
    });
    if (params.messageIds && params.messageIds.length > 0) {
      for (const messageId of params.messageIds) {
        await tx.groupChatReadReceipt.upsert({
          where: { messageId_participantId: { messageId, participantId: participant.id } },
          create: { messageId, participantId: participant.id, readAt: now },
          update: { readAt: now },
        });
      }
    }
    return { participantId: participant.id, readAt: now };
  });
}

export async function getGroupChatExportBatch(params: {
  groupId: string;
  actor: Actor;
  take: number;
  cursor?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  return db.$transaction(async tx => {
    const participant = await getActiveParticipantForActor(tx, params.groupId, params.actor);
    if (!participant) throw new Error('Active group participant not found');

    return tx.groupChatMessage.findMany({
      where: sentGroupMessageWhere({
        groupId: params.groupId,
        createdAt: {
          ...(params.startDate ? { gte: params.startDate } : {}),
          ...(params.endDate ? { lte: params.endDate } : {}),
          gte: participant.visibleFromAt,
          lte: participant.leftAt ?? undefined,
        },
      }),
      orderBy: { createdAt: 'asc' },
      take: params.take,
      skip: params.cursor ? 1 : 0,
      cursor: params.cursor ? { id: params.cursor } : undefined,
    });
  });
}

export async function listGroupChatPushTargets(params: { groupId: string }) {
  return db.groupChatParticipant.findMany({
    where: {
      groupId: params.groupId,
      participantType: GroupChatParticipantType.employee,
      status: GroupChatParticipantStatus.active,
      employeeId: { not: null },
    },
    select: {
      id: true,
      employeeId: true,
      isMuted: true,
    },
  });
}

export async function expireStaleGroupChatDrafts(now: Date = new Date()) {
  return db.groupChatMessage.updateMany({
    where: { status: ChatMessageStatus.draft, draftExpiresAt: { lte: now } },
    data: { status: ChatMessageStatus.expired },
  });
}
