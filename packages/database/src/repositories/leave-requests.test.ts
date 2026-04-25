import {
  OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR,
  createEmployeeLeaveRequest,
  getPaginatedEmployeeLeaveRequestsForAdmin,
  listEmployeeLeaveRequestsForAdmin,
} from './leave-requests';
import { db as prisma } from '../prisma/client';
import { Prisma } from '@prisma/client';
import { createLeaveRequestCreatedAdminNotifications } from './admin-notifications';
import { enqueueEmailEvent } from '../email-events';
import { redis } from '../redis/client';

jest.mock('../prisma/client', () => ({
  db: {
    employeeLeaveRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
    },
    admin: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('./admin-notifications', () => ({
  createLeaveRequestCreatedAdminNotifications: jest.fn(),
}));

jest.mock('../email-events', () => ({
  enqueueEmailEvent: jest.fn(),
}));

jest.mock('../redis/client', () => ({
  redis: {
    publish: jest.fn(),
  },
}));

describe('leave-requests repository admin queries', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('listEmployeeLeaveRequestsForAdmin builds overlap and status filters', async () => {
    (prisma.employeeLeaveRequest.findMany as jest.Mock).mockResolvedValue([]);

    await listEmployeeLeaveRequestsForAdmin({
      statuses: ['pending', 'approved'],
      startDate: '2026-04-10',
      endDate: '2026-04-20',
      employeeRoleFilter: 'office',
    });

    expect(prisma.employeeLeaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['pending', 'approved'] },
          AND: [
            { endDate: { gte: new Date('2026-04-10T00:00:00Z') } },
            { startDate: { lte: new Date('2026-04-20T00:00:00Z') } },
          ],
          employee: {
            is: {
              role: 'office',
            },
          },
        }),
      })
    );
  });

  test('getPaginatedEmployeeLeaveRequestsForAdmin returns rows and total count', async () => {
    (prisma.employeeLeaveRequest.findMany as jest.Mock).mockResolvedValue([{ id: 'leave-1' }]);
    (prisma.employeeLeaveRequest.count as jest.Mock).mockResolvedValue(17);

    const result = await getPaginatedEmployeeLeaveRequestsForAdmin({
      statuses: ['pending'],
      skip: 10,
      take: 5,
    });

    expect(prisma.employeeLeaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
        where: expect.objectContaining({
          status: { in: ['pending'] },
        }),
      })
    );
    expect(prisma.employeeLeaveRequest.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['pending'] },
        }),
      })
    );
    expect(result).toEqual({
      leaveRequests: [{ id: 'leave-1' }],
      totalCount: 17,
    });
  });

  test('createEmployeeLeaveRequest rejects overlapping pending request', async () => {
    (prisma.employeeLeaveRequest.findFirst as jest.Mock).mockResolvedValue({ id: 'leave-existing' });

    await expect(
      createEmployeeLeaveRequest({
        employeeId: 'employee-1',
        startDate: '2026-04-10',
        endDate: '2026-04-12',
        reason: 'sick',
      })
    ).rejects.toThrow(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);

    expect(prisma.employeeLeaveRequest.create).not.toHaveBeenCalled();
    expect(prisma.changelog.create).not.toHaveBeenCalled();
  });

  test('createEmployeeLeaveRequest allows overlap when existing status is not pending', async () => {
    (prisma.employeeLeaveRequest.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.employeeLeaveRequest.create as jest.Mock).mockResolvedValue({
      id: 'leave-created',
      employeeId: 'employee-1',
      startDate: new Date('2026-04-10T00:00:00Z'),
      endDate: new Date('2026-04-12T00:00:00Z'),
      reason: 'sick',
      employeeNote: null,
      attachments: [],
      status: 'pending',
    });
    (prisma.changelog.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
    (createLeaveRequestCreatedAdminNotifications as jest.Mock).mockResolvedValue([
      {
        id: 'notif-1',
        adminId: 'admin-1',
        title: 'New leave request submitted',
        body: 'Employee requested leave.',
        payload: { targetPath: '/admin/leave-requests' },
      },
    ]);
    (prisma.admin.findMany as jest.Mock).mockResolvedValue([
      { id: 'admin-1', name: 'Admin One', email: 'admin1@example.com' },
    ]);
    (redis.publish as jest.Mock).mockResolvedValue(1);
    (enqueueEmailEvent as jest.Mock).mockResolvedValue({ id: 'email-job-1' });

    const created = await createEmployeeLeaveRequest({
      employeeId: 'employee-1',
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      reason: 'sick',
    });

    expect(created.id).toBe('leave-created');
    expect(prisma.employeeLeaveRequest.create).toHaveBeenCalled();
    expect(prisma.changelog.create).toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(enqueueEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'admin.leave_request_created',
        to: [{ email: 'admin1@example.com', name: 'Admin One' }],
        idempotencyKey: 'leave_request_created:leave-created:admin-1',
      })
    );
  });

  test('createEmployeeLeaveRequest maps exclusion-constraint conflict to overlap error', async () => {
    (prisma.employeeLeaveRequest.findFirst as jest.Mock).mockResolvedValue(null);

    const conflict = new Prisma.PrismaClientKnownRequestError('Constraint failed', {
      code: 'P2004',
      clientVersion: '7.7.0',
      meta: {
        database_error: 'employee_leave_requests_pending_no_overlap',
      },
    });
    (prisma.employeeLeaveRequest.create as jest.Mock).mockRejectedValue(conflict);

    await expect(
      createEmployeeLeaveRequest({
        employeeId: 'employee-1',
        startDate: '2026-04-10',
        endDate: '2026-04-12',
        reason: 'sick',
      })
    ).rejects.toThrow(OVERLAPPING_PENDING_LEAVE_REQUEST_ERROR);
  });
});
