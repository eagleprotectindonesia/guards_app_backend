import { markAsReadForEmployee, markAsReadForAdmin } from '@/lib/data-access/chat';
import { db as prisma } from '@repo/database';

jest.mock('@/lib/prisma', () => ({
  db: {
    chatMessage: {
      updateMany: jest.fn(),
    },
  },
}));

describe('Chat Authorization - markAsRead', () => {
  const employeeId = 'emp-123';
  const messageIds = ['msg-1', 'msg-2'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('markAsReadForEmployee', () => {
    test('should only update messages belonging to the employee and sent by admin', async () => {
      await markAsReadForEmployee(employeeId, messageIds);

      expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: messageIds },
          employeeId: employeeId,
          sender: 'admin',
          readAt: null,
          status: 'sent',
        },
        data: expect.objectContaining({
          readAt: expect.any(Date),
        }),
      });
    });
  });

  describe('markAsReadForAdmin', () => {
    test('should only update messages for the specific employee conversation sent by employee', async () => {
      await markAsReadForAdmin(employeeId, messageIds);

      expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: messageIds },
          employeeId: employeeId,
          sender: 'employee',
          readAt: null,
          status: 'sent',
        },
        data: expect.objectContaining({
          readAt: expect.any(Date),
        }),
      });
    });
  });
});
