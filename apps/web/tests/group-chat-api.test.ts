import { GET as listGroups, POST as createGroup } from '@/app/api/shared/group-chat/route';
import { GET as getGroup } from '@/app/api/shared/group-chat/[groupId]/route';
import { POST as addMembers } from '@/app/api/shared/group-chat/[groupId]/members/route';
import { DELETE as removeMember } from '@/app/api/shared/group-chat/[groupId]/members/[participantId]/route';
import { POST as leaveGroup } from '@/app/api/shared/group-chat/[groupId]/leave/route';

const mockGetCurrentAdmin = jest.fn();
const mockGetAuthenticatedEmployee = jest.fn();
const mockRequirePermission = jest.fn();
const mockCreateGroupChat = jest.fn();
const mockGetGroupChatListForParticipant = jest.fn();
const mockGetGroupChatForParticipant = jest.fn();
const mockAddGroupMembers = jest.fn();
const mockRemoveGroupMember = jest.fn();
const mockLeaveGroup = jest.fn();

jest.mock('@/lib/admin-auth', () => ({
  getCurrentAdmin: (...args: unknown[]) => mockGetCurrentAdmin(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: (...args: unknown[]) => mockGetAuthenticatedEmployee(...args),
}));

jest.mock('@/lib/data-access/group-chat', () => ({
  createGroupChat: (...args: unknown[]) => mockCreateGroupChat(...args),
  getGroupChatListForParticipant: (...args: unknown[]) => mockGetGroupChatListForParticipant(...args),
  getGroupChatForParticipant: (...args: unknown[]) => mockGetGroupChatForParticipant(...args),
  addGroupMembers: (...args: unknown[]) => mockAddGroupMembers(...args),
  removeGroupMember: (...args: unknown[]) => mockRemoveGroupMember(...args),
  leaveGroup: (...args: unknown[]) => mockLeaveGroup(...args),
  disbandGroup: jest.fn(),
  updateGroupChat: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  forbidden: jest.fn(() => {
    throw new Error('FORBIDDEN');
  }),
}));

describe('group chat API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentAdmin.mockResolvedValue({ id: 'admin-1' });
    mockGetAuthenticatedEmployee.mockResolvedValue(null);
    mockRequirePermission.mockResolvedValue({ id: 'admin-1' });
  });

  test('admin with chat:create can create group', async () => {
    mockCreateGroupChat.mockResolvedValue({ id: 'group-1', title: 'Ops' });

    const req = new Request('http://localhost/api/shared/group-chat', {
      method: 'POST',
      body: JSON.stringify({ title: 'Ops', employeeIds: ['emp-1'] }),
    });

    const res = await createGroup(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRequirePermission).toHaveBeenCalled();
    expect(body.id).toBe('group-1');
  });

  test('admin without chat:create is blocked', async () => {
    mockRequirePermission.mockRejectedValueOnce(new Error('FORBIDDEN'));

    const req = new Request('http://localhost/api/shared/group-chat', {
      method: 'POST',
      body: JSON.stringify({ title: 'Ops' }),
    });

    await expect(createGroup(req as never)).rejects.toThrow('FORBIDDEN');
  });

  test('participant can list own groups', async () => {
    mockGetCurrentAdmin.mockResolvedValue(null);
    mockGetAuthenticatedEmployee.mockResolvedValue({ id: 'emp-1' });
    mockGetGroupChatListForParticipant.mockResolvedValue({ groups: [], nextCursor: null });

    const req = {
      nextUrl: new URL('http://localhost/api/shared/group-chat?limit=20'),
    };
    const res = await listGroups(req as never);

    expect(res.status).toBe(200);
    expect(mockGetGroupChatListForParticipant).toHaveBeenCalled();
  });

  test('non-participant cannot fetch group', async () => {
    mockGetGroupChatForParticipant.mockResolvedValue(null);

    const req = new Request('http://localhost/api/shared/group-chat/group-1', { method: 'GET' });
    const res = await getGroup(req as never, { params: Promise.resolve({ groupId: 'group-1' }) } as never);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  test('owner can add member', async () => {
    mockAddGroupMembers.mockResolvedValue([{ id: 'p-1' }]);

    const req = new Request('http://localhost/api/shared/group-chat/group-1/members', {
      method: 'POST',
      body: JSON.stringify({ employeeIds: ['emp-2'] }),
    });

    const res = await addMembers(req as never, { params: Promise.resolve({ groupId: 'group-1' }) } as never);
    expect(res.status).toBe(200);
  });

  test('non-owner cannot add member', async () => {
    mockAddGroupMembers.mockRejectedValueOnce(new Error('Only group owner can perform this action'));

    const req = new Request('http://localhost/api/shared/group-chat/group-1/members', {
      method: 'POST',
      body: JSON.stringify({ employeeIds: ['emp-2'] }),
    });

    const res = await addMembers(req as never, { params: Promise.resolve({ groupId: 'group-1' }) } as never);
    expect(res.status).toBe(400);
  });

  test('owner can remove member', async () => {
    mockRemoveGroupMember.mockResolvedValue({ id: 'participant-1', status: 'removed' });

    const req = new Request('http://localhost/api/shared/group-chat/group-1/members/participant-1', { method: 'DELETE' });
    const res = await removeMember(
      req as never,
      { params: Promise.resolve({ groupId: 'group-1', participantId: 'participant-1' }) } as never
    );

    expect(res.status).toBe(200);
  });

  test('non-owner cannot remove member', async () => {
    mockRemoveGroupMember.mockRejectedValueOnce(new Error('Only group owner can perform this action'));

    const req = new Request('http://localhost/api/shared/group-chat/group-1/members/participant-1', { method: 'DELETE' });
    const res = await removeMember(
      req as never,
      { params: Promise.resolve({ groupId: 'group-1', participantId: 'participant-1' }) } as never
    );

    expect(res.status).toBe(400);
  });

  test('participant can leave', async () => {
    mockLeaveGroup.mockResolvedValue({ id: 'participant-1', status: 'left' });

    const req = new Request('http://localhost/api/shared/group-chat/group-1/leave', { method: 'POST' });
    const res = await leaveGroup(req as never, { params: Promise.resolve({ groupId: 'group-1' }) } as never);

    expect(res.status).toBe(200);
  });
});
