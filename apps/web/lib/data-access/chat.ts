import { db as prisma } from '@/lib/prisma';
import { ChatSenderType } from '@prisma/client';

export async function saveMessage(data: {
  guardId: string;
  adminId?: string;
  sender: ChatSenderType;
  content: string;
}) {
  return prisma.chatMessage.create({
    data,
    include: {
      guard: {
        select: {
          id: true,
          name: true,
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
}

export async function getChatMessages(guardId: string, limit = 50) {
  return prisma.chatMessage.findMany({
    where: {
      guardId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
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

export async function getConversationList() {
  const conversations = await prisma.chatMessage.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    distinct: ['guardId'],
    include: {
      guard: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const unreadCounts = await prisma.chatMessage.groupBy({
    by: ['guardId'],
    where: {
      sender: 'guard',
      readAt: null,
    },
    _count: {
      id: true,
    },
  });

  const unreadMap = unreadCounts.reduce((acc, curr) => {
    acc[curr.guardId] = curr._count.id;
    return acc;
  }, {} as Record<string, number>);

  return conversations.map((conv) => ({
    guardId: conv.guardId,
    guardName: conv.guard.name,
    lastMessage: {
      content: conv.content,
      sender: conv.sender,
      createdAt: conv.createdAt,
    },
    unreadCount: unreadMap[conv.guardId] || 0,
  }));
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
