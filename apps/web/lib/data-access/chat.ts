import { db as prisma } from '@/lib/prisma';
import { ChatMessageStatus, ChatSenderType, Prisma } from '@prisma/client';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

type ConversationView = 'inbox' | 'unread' | 'archived';
const CHAT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const chatMessageInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
    },
  },
  admin: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ChatMessageInclude;

function sentMessageWhere(where: Prisma.ChatMessageWhereInput = {}): Prisma.ChatMessageWhereInput {
  return {
    ...where,
    status: ChatMessageStatus.sent,
  };
}

export async function enrichMessageWithUrls<T extends { attachments?: string[] }>(message: T): Promise<T> {
  if (message.attachments && message.attachments.length > 0) {
    const enrichedAttachments = await Promise.all(
      message.attachments.map(async keyOrUrl => {
        // If it's already a full URL (legacy or external), return as is
        if (keyOrUrl.startsWith('http')) return keyOrUrl;
        // Otherwise treat as S3 key and get presigned URL
        return getCachedPresignedDownloadUrl(keyOrUrl);
      })
    );
    return { ...message, attachments: enrichedAttachments };
  }
  return message;
}

export async function saveMessage(data: {
  employeeId: string;
  adminId?: string;
  sender: ChatSenderType;
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) {
  const message = await prisma.chatMessage.create({
    data: {
      ...data,
      status: ChatMessageStatus.sent,
      sentAt: new Date(),
    },
    include: chatMessageInclude,
  });

  return enrichMessageWithUrls(message);
}

export async function reserveMessageDraft(data: {
  employeeId: string;
  adminId?: string;
  sender: ChatSenderType;
}) {
  const draft = await prisma.chatMessage.create({
    data: {
      employeeId: data.employeeId,
      adminId: data.adminId,
      sender: data.sender,
      status: ChatMessageStatus.draft,
      content: '',
      attachments: [],
      draftExpiresAt: new Date(Date.now() + CHAT_DRAFT_TTL_MS),
    },
    include: chatMessageInclude,
  });

  return draft;
}

export async function finalizeMessageDraft(data: {
  messageId: string;
  employeeId: string;
  adminId?: string;
  sender: ChatSenderType;
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) {
  const draft = await prisma.chatMessage.findUnique({
    where: { id: data.messageId },
    include: chatMessageInclude,
  });

  if (!draft) {
    throw new Error('Chat draft not found');
  }

  if (draft.employeeId !== data.employeeId || draft.sender !== data.sender) {
    throw new Error('Chat draft does not belong to this conversation');
  }

  if ((draft.adminId || null) !== (data.adminId || null)) {
    throw new Error('Chat draft does not belong to this sender');
  }

  if (draft.status === ChatMessageStatus.sent) {
    throw new Error('Chat draft already finalized');
  }

  if (draft.status === ChatMessageStatus.expired) {
    throw new Error('Chat draft has expired');
  }

  if (draft.draftExpiresAt && draft.draftExpiresAt <= new Date()) {
    await prisma.chatMessage.update({
      where: { id: data.messageId },
      data: {
        status: ChatMessageStatus.expired,
      },
    });
    throw new Error('Chat draft has expired');
  }

  const message = await prisma.chatMessage.update({
    where: { id: data.messageId },
    data: {
      content: data.content,
      attachments: data.attachments || [],
      latitude: data.latitude,
      longitude: data.longitude,
      createdAt: new Date(),
      status: ChatMessageStatus.sent,
      sentAt: new Date(),
      draftExpiresAt: null,
    },
    include: chatMessageInclude,
  });

  return enrichMessageWithUrls(message);
}

export async function expireStaleChatDrafts(now: Date = new Date()) {
  return prisma.chatMessage.updateMany({
    where: {
      status: ChatMessageStatus.draft,
      draftExpiresAt: {
        lte: now,
      },
    },
    data: {
      status: ChatMessageStatus.expired,
    },
  });
}

/**
 * Fetch all messages newer than a given ISO timestamp.
 * Used for targeted foreground reconciliation — avoids a full page-1 refetch.
 * Returns messages in ascending order so the client can prepend them.
 */
export async function getMessagesSince(employeeId: string, since: Date) {
  const messages = await prisma.chatMessage.findMany({
    where: sentMessageWhere({
      employeeId,
      createdAt: { gt: since },
    }),
    orderBy: { createdAt: 'asc' },
    include: {
      admin: {
        select: { id: true, name: true },
      },
    },
  });
  return Promise.all(messages.map(enrichMessageWithUrls));
}

export async function getChatMessages(employeeId: string, limit = 50, cursorId?: string) {
  const messages = await prisma.chatMessage.findMany({
    where: sentMessageWhere({
      employeeId,
    }),
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    skip: cursorId ? 1 : 0,
    cursor: cursorId ? { id: cursorId } : undefined,
    include: {
      admin: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return Promise.all(messages.map(enrichMessageWithUrls));
}

export async function getConversationList(adminId: string, view: ConversationView = 'inbox') {
  const conversations = await prisma.chatMessage.findMany({
    where: sentMessageWhere(),
    orderBy: {
      createdAt: 'desc',
    },
    distinct: ['employeeId'],
    include: {
      employee: {
        select: {
          fullName: true,
          employeeNumber: true,
        },
      },
      admin: {
        select: {
          name: true,
        },
      },
    },
  });

  const states = await prisma.adminChatConversationState.findMany({
    where: {
      adminId,
      employeeId: {
        in: conversations.map(conversation => conversation.employeeId),
      },
    },
  });

  const stateMap = states.reduce(
    (acc, state) => {
      acc[state.employeeId] = state;
      return acc;
    },
    {} as Record<string, (typeof states)[number]>
  );

  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ['employeeId'],
    where: sentMessageWhere({
      sender: 'employee',
      readAt: null,
    }),
    _count: {
      id: true,
    },
  });

  const unreadMap = unreadCounts.reduce(
    (acc, curr) => {
      acc[curr.employeeId] = curr._count.id;
      return acc;
    },
    {} as Record<string, number>
  );

  return conversations
    .map(conv => {
      const state = stateMap[conv.employeeId];

      return {
        employeeId: conv.employeeId,
        employeeName: conv.employee.fullName,
        employeeNumber: conv.employee.employeeNumber || conv.employeeId,
        isArchived: state?.isArchived ?? false,
        isMuted: state?.isMuted ?? false,
        lastMessage: {
          content: conv.content,
          sender: conv.sender,
          createdAt: conv.createdAt,
          adminId: conv.adminId || undefined,
          adminName: conv.admin?.name,
        },
        unreadCount: unreadMap[conv.employeeId] || 0,
      };
    })
    .filter(conv => {
      if (view === 'archived') return conv.isArchived;
      if (view === 'unread') return !conv.isArchived && conv.unreadCount > 0;
      return !conv.isArchived;
    });
}

export async function getUnreadCount(params: { employeeId?: string; isAdmin: boolean; adminId?: string }) {
  if (!params.isAdmin) {
    return prisma.chatMessage.count({
      where: sentMessageWhere({
        employeeId: params.employeeId,
        sender: 'admin',
        readAt: null,
      }),
    });
  }

  const archivedStates = params.adminId
    ? await prisma.adminChatConversationState.findMany({
        where: {
          adminId: params.adminId,
          isArchived: true,
        },
        select: {
          employeeId: true,
        },
      })
    : [];

  return prisma.chatMessage.count({
    where: sentMessageWhere({
      sender: 'employee',
      readAt: null,
      employeeId: archivedStates.length
        ? {
            notIn: archivedStates.map(state => state.employeeId),
          }
        : undefined,
    }),
  });
}

export async function setConversationArchiveState(params: {
  adminId: string;
  employeeId: string;
  isArchived: boolean;
}) {
  const now = new Date();

  return prisma.adminChatConversationState.upsert({
    where: {
      adminId_employeeId: {
        adminId: params.adminId,
        employeeId: params.employeeId,
      },
    },
    update: {
      isArchived: params.isArchived,
      isMuted: params.isArchived,
      archivedAt: params.isArchived ? now : null,
      mutedAt: params.isArchived ? now : null,
    },
    create: {
      adminId: params.adminId,
      employeeId: params.employeeId,
      isArchived: params.isArchived,
      isMuted: params.isArchived,
      archivedAt: params.isArchived ? now : null,
      mutedAt: params.isArchived ? now : null,
    },
  });
}

export async function getChatExportBatch(params: {
  take: number;
  where: Prisma.ChatMessageWhereInput;
  cursor?: string;
}) {
  return prisma.chatMessage.findMany({
    take: params.take,
    skip: params.cursor ? 1 : 0,
    cursor: params.cursor ? { id: params.cursor } : undefined,
    where: sentMessageWhere(params.where),
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      employee: {
        select: {
          fullName: true,
          id: true,
        },
      },
      admin: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function markAsRead(messageIds: string[]) {
  return prisma.chatMessage.updateMany({
    where: {
      id: {
        in: messageIds,
      },
      status: ChatMessageStatus.sent,
    },
    data: {
      readAt: new Date(),
    },
  });
}

export async function markAsReadForEmployee(employeeId: string, messageIds: string[]) {
  return prisma.chatMessage.updateMany({
    where: {
      id: { in: messageIds },
      employeeId,
      sender: 'admin',
      readAt: null,
      status: ChatMessageStatus.sent,
    },
    data: {
      readAt: new Date(),
    },
  });
}

export async function markAsReadForAdmin(employeeId: string, messageIds: string[]) {
  return prisma.chatMessage.updateMany({
    where: {
      id: { in: messageIds },
      employeeId,
      sender: 'employee',
      readAt: null,
      status: ChatMessageStatus.sent,
    },
    data: {
      readAt: new Date(),
    },
  });
}

// --- Backward Compatibility Aliases ---
/** @deprecated Use saveMessage with employeeId */
export async function saveGuardMessage(data: {
  guardId: string;
  adminId?: string;
  sender: ChatSenderType;
  content: string;
  attachments?: string[];
}) {
  const { guardId, ...rest } = data;
  return saveMessage({ employeeId: guardId, ...rest });
}
