import { resolveAdminRecipientsForLeaveRequestCreated } from './admin-notifications';
import { db as prisma } from '../prisma/client';
import { getAllActiveAdminOwnershipAssignments } from './admin-ownership';

jest.mock('../prisma/client', () => ({
  db: {
    employee: {
      findUnique: jest.fn(),
    },
    admin: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('./admin-ownership', () => ({
  getAllActiveAdminOwnershipAssignments: jest.fn(),
  getMatchingAdminIdsForEmployeeScope: jest.requireActual('./admin-ownership').getMatchingAdminIdsForEmployeeScope,
}));

describe('admin-notifications recipient resolution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns all matching admins for leave ownership', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      id: 'emp-1',
      department: 'Operations Team',
      officeId: 'office-1',
    });
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'oa-1',
        adminId: 'admin-a',
        domain: 'leave',
        departmentKey: 'operations team',
        officeId: null,
        priority: 100,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        isActive: true,
      },
      {
        id: 'oa-2',
        adminId: 'admin-b',
        domain: 'leave',
        departmentKey: null,
        officeId: 'office-1',
        priority: 100,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        isActive: true,
      },
    ]);
    (prisma.admin.findMany as jest.Mock).mockResolvedValue([{ id: 'fallback-admin' }]);

    const recipients = await resolveAdminRecipientsForLeaveRequestCreated('emp-1');

    expect(recipients).toEqual(['admin-a', 'admin-b']);
  });

  test('dedupes recipients when same admin has multiple matching assignments', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      id: 'emp-1',
      department: 'Operations Team',
      officeId: 'office-1',
    });
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'oa-1',
        adminId: 'admin-a',
        domain: 'leave',
        departmentKey: 'operations team',
        officeId: null,
        priority: 100,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        isActive: true,
      },
      {
        id: 'oa-2',
        adminId: 'admin-a',
        domain: 'leave',
        departmentKey: null,
        officeId: 'office-1',
        priority: 100,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        isActive: true,
      },
    ]);
    (prisma.admin.findMany as jest.Mock).mockResolvedValue([{ id: 'fallback-admin' }]);

    const recipients = await resolveAdminRecipientsForLeaveRequestCreated('emp-1');

    expect(recipients).toEqual(['admin-a']);
  });

  test('falls back only when no ownership assignments match', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      id: 'emp-1',
      department: 'Operations Team',
      officeId: 'office-1',
    });
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([
      {
        id: 'oa-1',
        adminId: 'admin-a',
        domain: 'leave',
        departmentKey: 'it',
        officeId: null,
        priority: 100,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        isActive: true,
      },
    ]);
    (prisma.admin.findMany as jest.Mock).mockResolvedValue([{ id: 'fallback-admin-a' }, { id: 'fallback-admin-b' }]);

    const recipients = await resolveAdminRecipientsForLeaveRequestCreated('emp-1');

    expect(recipients).toEqual(['fallback-admin-a', 'fallback-admin-b']);
  });

  test('returns empty list when employee is not found', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    (getAllActiveAdminOwnershipAssignments as jest.Mock).mockResolvedValue([]);
    (prisma.admin.findMany as jest.Mock).mockResolvedValue([{ id: 'fallback-admin' }]);

    const recipients = await resolveAdminRecipientsForLeaveRequestCreated('missing-employee');

    expect(recipients).toEqual([]);
  });
});
