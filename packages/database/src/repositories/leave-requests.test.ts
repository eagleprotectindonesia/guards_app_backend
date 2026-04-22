import {
  getPaginatedEmployeeLeaveRequestsForAdmin,
  listEmployeeLeaveRequestsForAdmin,
} from './leave-requests';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    employeeLeaveRequest: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
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
});

