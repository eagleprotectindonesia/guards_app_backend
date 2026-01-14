import { db as prisma } from '@/lib/prisma';
import { ChatSenderType } from '@prisma/client';

export async function saveMessage(data: {
  employeeId: string;
  adminId?: string;
  sender: ChatSenderType;
  content: string;
}) {
  return prisma.chatMessage.create({
    data,
    include: {
      employee: {
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

export async function getChatMessages(employeeId: string, limit = 50, cursorId?: string) {
  return prisma.chatMessage.findMany({
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
}

export async function getConversationList() {
  const conversations = await prisma.chatMessage.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    distinct: ['employeeId'],
    include: {
      employee: {
        select: {
          id: true,
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
    employeeName: conv.employee.name,
    lastMessage: {
      content: conv.content,
      sender: conv.sender,
      createdAt: conv.createdAt,
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
export async function saveGuardMessage(data: { guardId: string; adminId?: string; sender: ChatSenderType; content: string }) {
  const { guardId, ...rest } = data;
  return saveMessage({ employeeId: guardId, ...rest });
}