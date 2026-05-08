import { markAsReadForEmployee, markAsReadForAdmin } from '@/lib/data-access/chat';
import {
  markAsReadForEmployee as markAsReadForEmployeeDb,
  markAsReadForAdmin as markAsReadForAdminDb,
} from '@repo/database';

jest.mock('@repo/database', () => ({
  markAsReadForEmployee: jest.fn(),
  markAsReadForAdmin: jest.fn(),
}));

describe('Chat Authorization - markAsRead wrappers', () => {
  const employeeId = 'emp-123';
  const messageIds = ['msg-1', 'msg-2'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('markAsReadForEmployee delegates to repository function', async () => {
    await markAsReadForEmployee(employeeId, messageIds);

    expect(markAsReadForEmployeeDb as jest.Mock).toHaveBeenCalledWith(employeeId, messageIds);
  });

  test('markAsReadForAdmin delegates to repository function', async () => {
    await markAsReadForAdmin(employeeId, messageIds);

    expect(markAsReadForAdminDb as jest.Mock).toHaveBeenCalledWith(employeeId, messageIds);
  });
});
