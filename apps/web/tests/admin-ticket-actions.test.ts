import {
  createTicketAction,
  updateTicketStatusAction,
  createTicketAttachmentUploadUrlAction,
} from '../app/admin/(authenticated)/ticket/actions';
import { createTicket, updateTicketStatus } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { getPresignedUploadUrl } from '@/lib/s3';

jest.mock('@repo/database', () => ({
  createTicket: jest.fn(),
  updateTicketStatus: jest.fn(),
}));

jest.mock('@/lib/admin-auth', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/s3', () => ({
  getPresignedUploadUrl: jest.fn(),
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
      priority: 'HIGH',
    });

    expect(ticket.id).toBe('ticket-1');
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        submitterAdminId: 'admin-1',
        priority: 'HIGH',
      })
    );
  });

  test('updateTicketStatusAction passes actor context', async () => {
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
        fileName: 'big.mp4',
        contentType: 'video/mp4',
        fileSize: 11 * 1024 * 1024,
      })
    ).rejects.toThrow('10MB');
  });

  test('createTicketAttachmentUploadUrlAction requests presigned url', async () => {
    (getPresignedUploadUrl as jest.Mock).mockResolvedValue({ uploadUrl: 'u', publicUrl: 'p', key: 'k' });

    const result = await createTicketAttachmentUploadUrlAction({
      fileName: 'evidence.png',
      contentType: 'image/png',
      fileSize: 512000,
    });

    expect(result).toEqual({ uploadUrl: 'u', publicUrl: 'p', key: 'k' });
    expect(getPresignedUploadUrl).toHaveBeenCalled();
  });
});
