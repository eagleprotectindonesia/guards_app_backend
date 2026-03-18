import { db } from '../prisma/client';
import { ChatMessageStatus, ChatSenderType, Prisma } from '@prisma/client';

type ConversationView = 'inbox' | 'unread' | 'archived';
const CHAT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export const chatMessageInclude = {
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

export type ChatMessageInclude = Prisma.ChatMessageInclude;

function sentMessageWhere(where: Prisma.ChatMessageWhereInput = {}): Prisma.ChatMessageWhereInput {
  return {
    ...where,
    status: ChatMessageStatus.sent,
  };
}

/**
 * Upserts a ChatConversation row with the latest message data.
 * Must be called after every `saveMessage` and `finalizeMessageDraft`.
 */
async function syncChatConversation(msg: {
  employeeId: string;
  content: string;
  sender: ChatSenderType;
  adminId?: string | null;
  createdAt: Date;
}) {
  await db.chatConversation.upsert({
    where: { employeeId: msg.employeeId },
    create: {
      employeeId: msg.employeeId,
      lastMessageAt: msg.createdAt,
      lastMessageContent: msg.content,
      lastMessageSender: msg.sender,
      lastMessageAdminId: msg.adminId ?? null,
      unreadCount: msg.sender === 'employee' ? 1 : 0,
    },
    update: {
      lastMessageAt: msg.createdAt,
      lastMessageContent: msg.content,
      lastMessageSender: msg.sender,
      lastMessageAdminId: msg.adminId ?? null,
      ...(msg.sender === 'employee' ? { unreadCount: { increment: 1 } } : {}),
    },
  });
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
  const message = await db.chatMessage.create({
    data: {
      ...data,
      status: ChatMessageStatus.sent,
      sentAt: new Date(),
    },
    include: chatMessageInclude,
  });

  await syncChatConversation({
    employeeId: message.employeeId,
    content: message.content,
    sender: message.sender,
    adminId: message.adminId,
    createdAt: message.createdAt,
  });

  return message;
}

export async function reserveMessageDraft(data: {
  employeeId: string;
  adminId?: string;
  sender: ChatSenderType;
}) {
  const draft = await db.chatMessage.create({
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
  const draft = await db.chatMessage.findUnique({
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
    await db.chatMessage.update({
      where: { id: data.messageId },
      data: {
        status: ChatMessageStatus.expired,
      },
    });
    throw new Error('Chat draft has expired');
  }

  const message = await db.chatMessage.update({
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

  await syncChatConversation({
    employeeId: message.employeeId,
    content: message.content,
    sender: message.sender,
    adminId: message.adminId,
    createdAt: message.createdAt,
  });

  return message;
}

export async function expireStaleChatDrafts(now: Date = new Date()) {
  return db.chatMessage.updateMany({
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
  return db.chatMessage.findMany({
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
}

export async function getChatMessages(employeeId: string, limit = 50, cursorId?: string) {
  return db.chatMessage.findMany({
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
}

export interface ConversationPage {
  conversations: ConversationItem[];
  nextCursor: string | null;
}

export interface ConversationItem {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  isArchived: boolean;
  isMuted: boolean;
  lastMessage: {
    content: string;
    sender: string;
    createdAt: Date;
    adminId?: string;
  };
  unreadCount: number;
}

export async function getConversationListPaginated(params: {
  adminId: string;
  view: ConversationView;
  limit: number;
  cursor?: string;
  search?: string;
}): Promise<ConversationPage> {
  const { adminId, view, limit, cursor, search } = params;

  const archivedEmployeeIds = await db.adminChatConversationState
    .findMany({
      where: { adminId, isArchived: true },
      select: { employeeId: true },
    })
    .then(rows => rows.map(r => r.employeeId));

  const viewWhere: Record<string, unknown> =
    view === 'archived'
      ? { employeeId: { in: archivedEmployeeIds } }
      : view === 'unread'
        ? { employeeId: { notIn: archivedEmployeeIds }, unreadCount: { gt: 0 } }
        : { employeeId: { notIn: archivedEmployeeIds } };

  const rows = await db.chatConversation.findMany({
    where: {
      ...viewWhere,
      ...(search
        ? {
            employee: {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { employeeNumber: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
      ...(cursor ? { lastMessageAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit + 1,
    include: {
      employee: {
        select: { fullName: true, employeeNumber: true },
      },
    },
  });

  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;

  const stateRows = await db.adminChatConversationState.findMany({
    where: {
      adminId,
      employeeId: { in: page.map(r => r.employeeId) },
    },
  });
  const stateMap = Object.fromEntries(stateRows.map(s => [s.employeeId, s]));

  const conversations: ConversationItem[] = page.map(row => {
    const state = stateMap[row.employeeId];
    return {
      employeeId: row.employeeId,
      employeeName: row.employee.fullName,
      employeeNumber: row.employee.employeeNumber ?? row.employeeId,
      isArchived: state?.isArchived ?? false,
      isMuted: state?.isMuted ?? false,
      lastMessage: {
        content: row.lastMessageContent,
        sender: row.lastMessageSender,
        createdAt: row.lastMessageAt,
        adminId: row.lastMessageAdminId ?? undefined,
      },
      unreadCount: row.unreadCount,
    };
  });

  const nextCursor = hasNextPage ? page[page.length - 1].lastMessageAt.toISOString() : null;

  return { conversations, nextCursor };
}

/** Lightweight fetch of archived employee IDs for the given admin — used on mount. */
export async function getArchivedConversationIds(adminId: string): Promise<string[]> {
  const rows = await db.adminChatConversationState.findMany({
    where: { adminId, isArchived: true },
    select: { employeeId: true },
  });
  return rows.map(r => r.employeeId);
}

/** @deprecated Use getConversationListPaginated */
export async function getConversationList(adminId: string, view: ConversationView = 'inbox') {
  const conversations = await db.chatMessage.findMany({
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

  const states = await db.adminChatConversationState.findMany({
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

  const unreadCounts = await db.chatMessage.groupBy({
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
    return db.chatMessage.count({
      where: sentMessageWhere({
        employeeId: params.employeeId,
        sender: 'admin',
        readAt: null,
      }),
    });
  }

  const archivedStates = params.adminId
    ? await db.adminChatConversationState.findMany({
        where: {
          adminId: params.adminId,
          isArchived: true,
        },
        select: {
          employeeId: true,
        },
      })
    : [];

  return db.chatMessage.count({
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

  return db.adminChatConversationState.upsert({
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
  return db.chatMessage.findMany({
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
  return db.chatMessage.updateMany({
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
  return db.chatMessage.updateMany({
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
  const result = await db.chatMessage.updateMany({
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

  if (result.count > 0) {
    await db.chatConversation.updateMany({
      where: { employeeId },
      data: { unreadCount: 0 },
    });
  }

  return result;
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
