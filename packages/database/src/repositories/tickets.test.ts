import {
  canTransitionStatus,
  createTicket,
  updateTicketStatus,
} from './tickets';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    role: {
      findUnique: jest.fn(),
    },
    ticketCodeSequence: {
      upsert: jest.fn(),
    },
    ticket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ticketAssignedRole: {
      create: jest.fn(),
    },
    ticketHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe('tickets repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
  });

  test('createTicket creates ticket, default assignment, and history entries', async () => {
    (prisma.role.findUnique as jest.Mock).mockResolvedValue({ name: 'IT' });
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
      priority: 'MEDIUM',
      submitterAdminId: 'admin-1',
      departmentRoleId: 'role-it',
      clientName: 'Acme',
      clientContact: '+62811',
      clientLocation: 'Jakarta',
    });

    expect(prisma.ticket.create).toHaveBeenCalled();
    expect(prisma.ticketAssignedRole.create).toHaveBeenCalledWith({
      data: { ticketId: 'ticket-1', roleId: 'role-it' },
    });
    expect(prisma.ticketHistory.create).toHaveBeenCalledTimes(2);
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
});
