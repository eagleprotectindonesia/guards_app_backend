import {
  addTicketMessageWithAttachmentsAction,
  claimTicketAction,
  createTicketAction,
  updateTicketStatusAction,
  createTicketAttachmentUploadUrlAction,
} from '../app/admin/(authenticated)/ticket/actions';
import { addTicketMessageWithAttachments, claimTicket, createTicket, db, getTicketById, updateTicketStatus } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { getPresignedUploadPostPolicy } from '@/lib/s3';

jest.mock('@repo/database', () => ({
  createTicket: jest.fn(),
  getTicketById: jest.fn(),
  updateTicketStatus: jest.fn(),
  addTicketMessageWithAttachments: jest.fn(),
  claimTicket: jest.fn(),
  db: {
    admin: {
      findUnique: jest.fn(),
    },
    ticket: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/admin-auth', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/s3', () => ({
  getPresignedUploadPostPolicy: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('ticket actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requirePermission as jest.Mock).mockResolvedValue({
      id: 'admin-1',
      roleName: 'Admin',
      isSuperAdmin: false,
      permissions: ['tickets:view', 'tickets:create'],
    });
  });

  test('createTicketAction validates and forwards payload', async () => {
    (createTicket as jest.Mock).mockResolvedValue({ id: 'ticket-1', code: 'IT_2026_05_0001' });

    const ticket = await createTicketAction({
      title: 'Network outage',
      description: 'Office internet down',
      departmentRoleId: 'role-it',
      clientName: 'Acme',
      clientContact: '+62811',
      clientLocation: 'Makassar',
      resolutionTargetHours: 4,
      priority: 'HIGH',
    });

    expect(ticket.id).toBe('ticket-1');
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        submitterAdminId: 'admin-1',
        resolutionTargetHours: 4,
        priority: 'HIGH',
      })
    );
  });

  test('updateTicketStatusAction passes actor context', async () => {
    (db.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: 'ticket-1',
      submitterAdminId: 'admin-1',
      claimedByType: 'ADMIN',
      claimedByAdminId: 'admin-2',
      code: 'IT_2026_05_0001',
    });
    (updateTicketStatus as jest.Mock).mockResolvedValue({ id: 'ticket-1', status: 'CLOSED' });

    await updateTicketStatusAction({ ticketId: 'ticket-1', status: 'CLOSED' });

    expect(updateTicketStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        nextStatus: 'CLOSED',
        actorAdminId: 'admin-1',
      })
    );
  });

  test('createTicketAttachmentUploadUrlAction rejects oversized file', async () => {
    await expect(
      createTicketAttachmentUploadUrlAction({
        ticketId: 'ticket-1',
        fileName: 'big.mp4',
        contentType: 'video/mp4',
        fileSize: 11 * 1024 * 1024,
      })
    ).rejects.toThrow('10MB');
  });

  test('createTicketAttachmentUploadUrlAction requests presigned url', async () => {
    (getTicketById as jest.Mock).mockResolvedValue({ id: 'ticket-1' });
    (getPresignedUploadPostPolicy as jest.Mock).mockResolvedValue({ url: 'u', fields: { key: 'k' }, key: 'k' });

    const result = await createTicketAttachmentUploadUrlAction({
      ticketId: 'ticket-1',
      fileName: 'evidence.png',
      contentType: 'image/png',
      fileSize: 512000,
    });

    expect(result).toEqual({ url: 'u', fields: { key: 'k' }, key: 'k' });
    expect(getPresignedUploadPostPolicy).toHaveBeenCalled();
  });

  test('addTicketMessageWithAttachmentsAction enforces key prefix ownership', async () => {
    (getTicketById as jest.Mock).mockResolvedValue({ id: 'ticket-1' });
    await expect(
      addTicketMessageWithAttachmentsAction({
        ticketId: 'ticket-1',
        body: 'need help',
        attachments: [
          {
            fileName: 'a.pdf',
            fileSize: 1000,
            mimeType: 'application/pdf',
            s3Key: 'tickets/temp/admin-999/a.pdf',
          },
        ],
      })
    ).rejects.toThrow('outside allowed upload prefix');
  });

  test('addTicketMessageWithAttachmentsAction calls repository atomically', async () => {
    (getTicketById as jest.Mock).mockResolvedValue({ id: 'ticket-1' });
    (addTicketMessageWithAttachments as jest.Mock).mockResolvedValue({ message: { id: 'm1' }, attachments: [] });

    const result = await addTicketMessageWithAttachmentsAction({
      ticketId: 'ticket-1',
      body: 'need help',
      attachments: [
        {
          fileName: 'a.pdf',
          fileSize: 1000,
          mimeType: 'application/pdf',
          s3Key: 'tickets/temp/admin-1/a.pdf',
        },
      ],
    });

    expect(result.message.id).toBe('m1');
    expect(addTicketMessageWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'ticket-1',
        adminId: 'admin-1',
      })
    );
  });

  test('claimTicketAction enforces department claim context', async () => {
    (db.admin.findUnique as jest.Mock).mockResolvedValue({ roleId: 'role-it' });
    (claimTicket as jest.Mock).mockResolvedValue({ id: 'ticket-1', claimedByType: 'ADMIN', claimedByAdminId: 'admin-1' });

    const result = await claimTicketAction('ticket-1');

    expect(result.id).toBe('ticket-1');
    expect(claimTicket).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      actorAdminId: 'admin-1',
      actorRoleId: 'role-it',
      actorIsSuperAdmin: false,
    });
  });
});
