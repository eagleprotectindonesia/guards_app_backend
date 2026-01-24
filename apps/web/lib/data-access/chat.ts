import { db as prisma } from '@/lib/prisma';
import { ChatSenderType } from '@prisma/client';
import { getCachedPresignedDownloadUrl } from '@/lib/s3';

export async function enrichMessageWithUrls<T extends { attachments?: string[] }>(message: T): Promise<T> {
  if (message.attachments && message.attachments.length > 0) {
    const enrichedAttachments = await Promise.all(
      message.attachments.map(async (keyOrUrl) => {
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
}) {
  const message = await prisma.chatMessage.create({
    data,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      admin: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return enrichMessageWithUrls(message);
}

export async function getChatMessages(employeeId: string, limit = 50, cursorId?: string) {
  const messages = await prisma.chatMessage.findMany({
    where: {
      employeeId,
    },
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

export async function getConversationList() {
  const conversations = await prisma.chatMessage.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    distinct: ['employeeId'],
    include: {
      employee: true,
      admin: {
        select: {
          name: true,
        },
      },
    },
  });

  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ['employeeId'],
    where: {
      sender: 'employee',
      readAt: null,
    },
    _count: {
      id: true,
    },
  });

  const unreadMap = unreadCounts.reduce((acc, curr) => {
    acc[curr.employeeId] = curr._count.id;
    return acc;
  }, {} as Record<string, number>);

  return conversations.map((conv) => ({
    employeeId: conv.employeeId,
    employeeName: conv.employee.fullName,
    lastMessage: {
      content: conv.content,
      sender: conv.sender,
      createdAt: conv.createdAt,
      adminId: conv.adminId || undefined,
      adminName: conv.admin?.name,
    },
    unreadCount: unreadMap[conv.employeeId] || 0,
  }));
}

export async function getUnreadCount(params: { employeeId?: string; isAdmin: boolean }) {
  return prisma.chatMessage.count({
    where: {
      employeeId: params.employeeId,
      sender: params.isAdmin ? 'employee' : 'admin',
      readAt: null,
    },
  });
}

export async function getChatExportBatch(params: {
  take: number;
  where: import('@prisma/client').Prisma.ChatMessageWhereInput;
  cursor?: string;
}) {
  return prisma.chatMessage.findMany({
    take: params.take,
    skip: params.cursor ? 1 : 0,
    cursor: params.cursor ? { id: params.cursor } : undefined,
    where: params.where,
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
    },
    data: {
      readAt: new Date(),
    },
  });
}

// --- Backward Compatibility Aliases ---
/** @deprecated Use saveMessage with employeeId */
export async function saveGuardMessage(data: { guardId: string; adminId?: string; sender: ChatSenderType; content: string; attachments?: string[] }) {
  const { guardId, ...rest } = data;
  return saveMessage({ employeeId: guardId, ...rest });
}