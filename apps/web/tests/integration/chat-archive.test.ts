import { getConversationList, getUnreadCount, setConversationArchiveState } from '@/lib/data-access/chat';
import {
  getConversationList as getConversationListDb,
  getUnreadCount as getUnreadCountDb,
  setConversationArchiveState as setConversationArchiveStateDb,
} from '@repo/database';

jest.mock('@repo/database', () => ({
  getConversationList: jest.fn(),
  getUnreadCount: jest.fn(),
  setConversationArchiveState: jest.fn(),
}));

describe('chat archive data-access wrappers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getConversationList delegates to repository function', async () => {
    (getConversationListDb as jest.Mock).mockResolvedValue([{ employeeId: 'emp-1' }]);

    const result = await getConversationList('admin-1', 'inbox');

    expect(getConversationListDb as jest.Mock).toHaveBeenCalledWith('admin-1', 'inbox');
    expect(result).toEqual([{ employeeId: 'emp-1' }]);
  });

  test('getUnreadCount delegates to repository function', async () => {
    (getUnreadCountDb as jest.Mock).mockResolvedValue(4);

    const count = await getUnreadCount({
      isAdmin: true,
      adminId: 'admin-1',
    });

    expect(getUnreadCountDb as jest.Mock).toHaveBeenCalledWith({
      isAdmin: true,
      adminId: 'admin-1',
    });
    expect(count).toBe(4);
  });

  test('setConversationArchiveState delegates to repository function', async () => {
    (setConversationArchiveStateDb as jest.Mock).mockResolvedValue({
      employeeId: 'emp-1',
      isArchived: true,
      isMuted: true,
    });

    await setConversationArchiveState({
      adminId: 'admin-1',
      employeeId: 'emp-1',
      isArchived: true,
    });

    expect(setConversationArchiveStateDb as jest.Mock).toHaveBeenCalledWith({
      adminId: 'admin-1',
      employeeId: 'emp-1',
      isArchived: true,
    });
  });
});
