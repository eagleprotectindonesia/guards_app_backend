import {
  addTicketAttachments,
  canTransitionStatus,
  claimTicket,
  createTicket,
  getTicketDashboardComparisonStats,
  getTicketDashboardSidebarStats,
  getTicketSidebarCounts,
  listClosedTickets,
  listTickets,
  listMyTickets,
  listUnassignedTickets,
  updateTicketStatus,
} from './tickets';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    role: {
      findUnique: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
    },
    ticketCodeSequence: {
      upsert: jest.fn(),
    },
    ticket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    ticketAssignedRole: {
      create: jest.fn(),
    },
    ticketAssignedEmployee: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    ticketMessage: {
      findMany: jest.fn(),
    },
    ticketAttachment: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    ticketHistory: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

describe('tickets repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
  });

  test('createTicket creates ticket, default assignment, and history entries', async () => {
    (prisma.role.findUnique as jest.Mock).mockResolvedValue({
      name: 'IT Head',
      policy: { ticketDepartment: 'IT' },
    });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }]);
    (prisma.ticketCodeSequence.upsert as jest.Mock).mockResolvedValue({ value: 17 });
    (prisma.ticket.create as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      code: 'IT_2026_05_0017',
      status: 'NEW',
      priority: 'MEDIUM',
    });

    await createTicket({
      title: 'VPN down',
      description: 'VPN cannot connect',
      resolutionTargetHours: 4,
      priority: 'MEDIUM',
      submitterAdminId: 'admin-1',
      departmentRoleId: 'role-it',
      clientName: 'Acme',
      clientContact: '+62811',
      clientLocation: 'Jakarta',
    });

    expect(prisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resolutionTargetHours: 4,
        }),
      })
    );
    expect(prisma.ticketAssignedRole.create).toHaveBeenCalledWith({
      data: { ticketId: 'ticket-1', roleId: 'role-it' },
    });
    expect(prisma.ticketAssignedEmployee.createMany).toHaveBeenCalledWith({
      data: [
        { ticketId: 'ticket-1', employeeId: 'emp-1', matchKeyword: 'IT' },
        { ticketId: 'ticket-1', employeeId: 'emp-2', matchKeyword: 'IT' },
      ],
    });
    expect(prisma.ticketHistory.create).toHaveBeenCalledTimes(2);
  });

  test('createTicket skips employee assignment when no department matches', async () => {
    (prisma.role.findUnique as jest.Mock).mockResolvedValue({ name: 'Finance', policy: null });
    (prisma.employee.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.ticketCodeSequence.upsert as jest.Mock).mockResolvedValue({ value: 18 });
    (prisma.ticket.create as jest.Mock).mockResolvedValue({
      id: 'ticket-2',
      code: 'FIN_2026_05_0018',
      status: 'NEW',
      priority: 'MEDIUM',
    });

    await createTicket({
      title: 'Payroll issue',
      description: 'Incorrect payroll export',
      resolutionTargetHours: 8,
      priority: 'MEDIUM',
      submitterAdminId: 'admin-2',
      departmentRoleId: 'role-finance',
      clientName: 'Acme',
      clientContact: '+62812',
      clientLocation: 'Bandung',
    });

    expect(prisma.ticketAssignedEmployee.createMany).not.toHaveBeenCalled();
  });

  test('canTransitionStatus allows submitter close without edit permission', () => {
    const allowed = canTransitionStatus({
      currentStatus: 'IN_PROGRESS',
      nextStatus: 'CLOSED',
      isSubmitter: true,
      roleName: 'admin',
      isSuperAdmin: false,
      permissions: [],
    });
    expect(allowed).toBe(true);
  });

  test('canTransitionStatus blocks operational status for non-it without permission', () => {
    const allowed = canTransitionStatus({
      currentStatus: 'NEW',
      nextStatus: 'ACKNOWLEDGED',
      isSubmitter: false,
      roleName: 'admin',
      isSuperAdmin: false,
      permissions: [],
    });
    expect(allowed).toBe(false);
  });

  test('updateTicketStatus writes status history', async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      status: 'NEW',
      submitterAdminId: 'admin-9',
    });
    (prisma.ticket.update as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      status: 'ACKNOWLEDGED',
    });

    await updateTicketStatus({
      ticketId: 'ticket-1',
      nextStatus: 'ACKNOWLEDGED',
      actorAdminId: 'admin-it',
      actorRoleName: 'IT',
      actorPermissions: [],
      actorIsSuperAdmin: false,
    });

    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1' },
        data: expect.objectContaining({ status: 'ACKNOWLEDGED' }),
      })
    );
    expect(prisma.ticketHistory.create).toHaveBeenCalled();
  });

  test('reopen to acknowledged clears terminal timestamps', async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      status: 'CLOSED',
      submitterAdminId: 'admin-9',
    });
    (prisma.ticket.update as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      status: 'ACKNOWLEDGED',
    });

    await updateTicketStatus({
      ticketId: 'ticket-1',
      nextStatus: 'ACKNOWLEDGED',
      actorAdminId: 'admin-it',
      actorRoleName: 'IT',
      actorPermissions: [],
      actorIsSuperAdmin: false,
    });

    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACKNOWLEDGED',
          solvedAt: null,
          closedAt: null,
          cannotResolveAt: null,
        }),
      })
    );
  });

  test('addTicketAttachments rejects messageId outside ticket', async () => {
    (prisma.ticketMessage.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      addTicketAttachments({
        ticketId: 'ticket-1',
        uploadedByAdminId: 'admin-1',
        attachments: [
          {
            fileName: 'evidence.pdf',
            fileSize: 1000,
            mimeType: 'application/pdf',
            s3Key: 'tickets/env=test/ticket_ticket-1/pdf/mock-uuid.pdf',
            messageId: 'msg-other',
          },
        ],
      })
    ).rejects.toThrow('messageId does not belong to the ticket');
  });

  test('claimTicket rejects actor outside department', async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      claimedByType: null,
      claimedByAdminId: null,
      claimedByEmployeeId: null,
      departmentRoleId: 'role-it',
      assignedEmployees: [],
    });

    await expect(
      claimTicket({
        ticketId: 'ticket-1',
        actorAdminId: 'admin-2',
        actorRoleId: 'role-hr',
        actorIsSuperAdmin: false,
      })
    ).rejects.toThrow('Only admins in the ticket department can claim this ticket');
  });

  test('claimTicket reassigns and writes assignment history', async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      claimedByType: 'ADMIN',
      claimedByAdminId: 'admin-9',
      claimedByEmployeeId: null,
      departmentRoleId: 'role-it',
      assignedEmployees: [],
    });
    (prisma.ticket.update as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      claimedByType: 'ADMIN',
      claimedByAdminId: 'admin-1',
      claimedByAdmin: { id: 'admin-1', name: 'IT Admin', roleId: 'role-it' },
    });

    await claimTicket({
      ticketId: 'ticket-1',
      actorAdminId: 'admin-1',
      actorRoleId: 'role-it',
      actorIsSuperAdmin: false,
    });

    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1' },
        data: expect.objectContaining({
          claimedByType: 'ADMIN',
          claimedByAdminId: 'admin-1',
          claimedByEmployeeId: null,
        }),
      })
    );
    expect(prisma.ticketHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ASSIGNMENT_CHANGED',
          fromValue: 'ADMIN:admin-9',
          toValue: 'ADMIN:admin-1',
        }),
      })
    );
  });

  test('claimTicket rejects when already claimed by the same admin', async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      claimedByType: 'ADMIN',
      claimedByAdminId: 'admin-1',
      claimedByEmployeeId: null,
      departmentRoleId: 'role-it',
      assignedEmployees: [],
    });

    await expect(
      claimTicket({
        ticketId: 'ticket-1',
        actorAdminId: 'admin-1',
        actorRoleId: 'role-it',
        actorIsSuperAdmin: false,
      })
    ).rejects.toThrow('Ticket is already claimed by you');
  });

  test('claimTicket auto-acknowledges when claiming a NEW ticket', async () => {
    (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-3',
      status: 'NEW',
      claimedByType: null,
      claimedByAdminId: null,
      claimedByEmployeeId: null,
      departmentRoleId: 'role-it',
      assignedEmployees: [],
    });
    (prisma.ticket.update as jest.Mock).mockResolvedValue({
      id: 'ticket-3',
      claimedByType: 'ADMIN',
      claimedByAdminId: 'admin-1',
      claimedByAdmin: { id: 'admin-1', name: 'IT Admin', roleId: 'role-it' },
    });

    await claimTicket({
      ticketId: 'ticket-3',
      actorAdminId: 'admin-1',
      actorRoleId: 'role-it',
      actorIsSuperAdmin: false,
    });

    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-3' },
        data: expect.objectContaining({ status: 'ACKNOWLEDGED' }),
      })
    );
    expect(prisma.ticketHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'STATUS_CHANGED',
          fromValue: 'NEW',
          toValue: 'ACKNOWLEDGED',
        }),
      })
    );
  });

  test('listMyTickets filters by admin claimant and active statuses', async () => {
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    await listMyTickets('admin-7');

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimedByType: 'ADMIN',
          claimedByAdminId: 'admin-7',
          status: { in: ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED'] },
        }),
      })
    );
  });

  test('listUnassignedTickets filters by unclaimed tickets', async () => {
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    await listUnassignedTickets();

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimedByType: null,
        }),
      })
    );
  });

  test('listClosedTickets only includes CLOSED status', async () => {
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    await listClosedTickets();

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['CLOSED'] },
        }),
      })
    );
  });

  test('getTicketSidebarCounts uses claim-based and closed-only counters', async () => {
    (prisma.ticket.count as jest.Mock)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);

    const counts = await getTicketSidebarCounts('admin-9');

    expect(counts).toEqual({ all: 10, my: 3, unassigned: 4, closed: 2 });
    expect(prisma.ticket.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          claimedByType: 'ADMIN',
          claimedByAdminId: 'admin-9',
        }),
      })
    );
    expect(prisma.ticket.count).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          claimedByType: null,
        }),
      })
    );
    expect(prisma.ticket.count).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['CLOSED'] },
        }),
      })
    );
  });

  test('getTicketDashboardSidebarStats counts submitted open tickets and zero-fills categories', async () => {
    (prisma.ticket.count as jest.Mock)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([
      {
        status: 'NEW',
        createdAt: new Date('2026-06-02T08:00:00.000Z'),
        updatedAt: new Date('2026-06-02T08:00:00.000Z'),
        resolutionTargetHours: 4,
        solvedAt: null,
        closedAt: null,
        cannotResolveAt: null,
      },
      {
        status: 'IN_PROGRESS',
        createdAt: new Date('2026-06-02T07:00:00.000Z'),
        updatedAt: new Date('2026-06-02T07:30:00.000Z'),
        resolutionTargetHours: 2,
        solvedAt: null,
        closedAt: null,
        cannotResolveAt: null,
      },
      {
        status: 'SOLVED',
        createdAt: new Date('2026-06-01T07:00:00.000Z'),
        updatedAt: new Date('2026-06-01T08:00:00.000Z'),
        resolutionTargetHours: 2,
        solvedAt: new Date('2026-06-01T08:30:00.000Z'),
        closedAt: null,
        cannotResolveAt: null,
      },
      {
        status: 'CLOSED',
        createdAt: new Date('2026-06-01T01:00:00.000Z'),
        updatedAt: new Date('2026-06-01T03:00:00.000Z'),
        resolutionTargetHours: 4,
        solvedAt: null,
        closedAt: new Date('2026-06-01T03:00:00.000Z'),
        cannotResolveAt: null,
      },
      {
        status: 'CANNOT_RESOLVE',
        createdAt: new Date('2026-06-01T01:00:00.000Z'),
        updatedAt: new Date('2026-06-01T02:00:00.000Z'),
        resolutionTargetHours: 3,
        solvedAt: null,
        closedAt: null,
        cannotResolveAt: new Date('2026-06-01T02:30:00.000Z'),
      },
    ]);

    const stats = await getTicketDashboardSidebarStats({
      adminId: 'admin-5',
      categories: ['HR', 'IT', 'CS'],
      startOfToday: new Date('2026-06-02T00:00:00.000Z'),
      now: new Date('2026-06-02T10:00:00.000Z'),
    });

    expect(stats.shortcuts).toEqual({
      myOpenSubmitted: 6,
      unassigned: 5,
      slaBreached: 2,
      resolvedToday: 4,
    });
    expect(stats.categories).toEqual([
      { value: 'HR', label: 'HR', count: 2, percentage: 40 },
      { value: 'IT', label: 'IT', count: 0, percentage: 0 },
      { value: 'CS', label: 'CS', count: 1, percentage: 20 },
    ]);
    expect(stats.slaStatus).toEqual({
      met: 2,
      pending: 1,
      breached: 2,
      total: 5,
      metPercentage: 40,
      pendingPercentage: 20,
      breachedPercentage: 40,
    });
    expect(prisma.ticket.count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          submitterAdminId: 'admin-5',
          status: { in: ['NEW', 'ACKNOWLEDGED', 'WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED'] },
        }),
      })
    );
  });

  test('getTicketDashboardSidebarStats excludes terminal statuses from unassigned count', async () => {
    (prisma.ticket.count as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);

    await getTicketDashboardSidebarStats({
      adminId: 'admin-7',
      categories: ['HR', 'IT', 'CS'],
      now: new Date('2026-06-02T10:00:00.000Z'),
    });

    expect(prisma.ticket.count).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          claimedByType: null,
          status: { notIn: ['CLOSED', 'CANNOT_RESOLVE'] },
        }),
      })
    );
  });

  test('getTicketDashboardSidebarStats keeps active tickets before deadline out of met', async () => {
    (prisma.ticket.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([
      {
        status: 'NEW',
        createdAt: new Date('2026-06-02T08:00:00.000Z'),
        updatedAt: new Date('2026-06-02T08:00:00.000Z'),
        resolutionTargetHours: 4,
        solvedAt: null,
        closedAt: null,
        cannotResolveAt: null,
      },
    ]);

    const stats = await getTicketDashboardSidebarStats({
      adminId: 'admin-7',
      categories: [],
      startOfToday: new Date('2026-06-02T00:00:00.000Z'),
      now: new Date('2026-06-02T10:00:00.000Z'),
    });

    expect(stats.slaStatus).toEqual({
      met: 0,
      pending: 1,
      breached: 0,
      total: 1,
      metPercentage: 0,
      pendingPercentage: 100,
      breachedPercentage: 0,
    });
  });

  test('getTicketDashboardComparisonStats returns yesterday created and resolved counts', async () => {
    (prisma.ticket.count as jest.Mock).mockResolvedValueOnce(7).mockResolvedValueOnce(3);

    const startOfToday = new Date('2026-06-02T00:00:00.000Z');
    const stats = await getTicketDashboardComparisonStats({ startOfToday });

    expect(stats).toEqual({
      yesterdayTotal: 7,
      yesterdayResolved: 3,
    });
    expect(prisma.ticket.count).toHaveBeenNthCalledWith(1, {
      where: {
        createdAt: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lt: startOfToday,
        },
      },
    });
    expect(prisma.ticket.count).toHaveBeenNthCalledWith(2, {
      where: {
        OR: [
          {
            solvedAt: {
              gte: new Date('2026-06-01T00:00:00.000Z'),
              lt: startOfToday,
            },
          },
          {
            closedAt: {
              gte: new Date('2026-06-01T00:00:00.000Z'),
              lt: startOfToday,
            },
          },
        ],
      },
    });
  });

  test('listTickets filters by assignedEmployeeId', async () => {
    (prisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    await listTickets({ assignedEmployeeId: 'emp-123' });

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedEmployees: { some: { employeeId: 'emp-123' } },
        }),
      })
    );
  });
});
