import { GET, PATCH } from '../app/api/employee/my/tickets/[id]/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getTicketById, updateTicketStatusByEmployee } from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getTicketById: jest.fn(),
  updateTicketStatusByEmployee: jest.fn(),
}));

jest.mock('@/lib/s3', () => ({
  getCachedPresignedDownloadUrl: jest.fn(),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      json: jest.fn((body, init) => ({
        json: async () => body,
        status: init?.status || 200,
      })),
    },
  };
});

describe('Ticket detail endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/employee/my/tickets/[id]', () => {
    test('returns 401 when employee is not authenticated', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(null);

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1');
      const response = await GET(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    test('returns 404 when ticket does not exist', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue(null);

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1');
      const response = await GET(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Ticket not found');
    });

    test('returns 403 when employee is not assigned to the ticket', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue({
        id: 'ticket-1',
        assignedEmployees: [{ employeeId: 'emp-2' }],
      });

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1');
      const response = await GET(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    test('returns ticket details when employee is assigned', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue({
        id: 'ticket-1',
        assignedEmployees: [{ employeeId: 'emp-1' }],
        attachments: [],
        messages: [],
      });

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1');
      const response = await GET(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ticket).toBeDefined();
      expect(data.ticket.id).toBe('ticket-1');
    });
  });

  describe('PATCH /api/employee/my/tickets/[id]', () => {
    test('returns 401 when employee is not authenticated', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(null);

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    test('returns 400 when status is invalid', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CLOSED' }), // CLOSED is not allowed for employee status change
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid status request');
    });

    test('returns 404 when ticket not found', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue(null);

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Ticket not found');
    });

    test('returns 403 when employee is not assigned', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue({
        id: 'ticket-1',
        assignedEmployees: [{ employeeId: 'emp-2' }],
      });

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    test('returns 400 when ticket is not claimed by the requesting employee', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue({
        id: 'ticket-1',
        assignedEmployees: [{ employeeId: 'emp-1' }],
        claimedByEmployeeId: 'emp-2', // claimed by someone else
      });

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only the employee who claimed the ticket can change its status');
    });

    test('successfully updates status when claimed by employee', async () => {
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: 'emp-1' });
      (getTicketById as jest.Mock).mockResolvedValue({
        id: 'ticket-1',
        assignedEmployees: [{ employeeId: 'emp-1' }],
        claimedByEmployeeId: 'emp-1',
      });
      (updateTicketStatusByEmployee as jest.Mock).mockResolvedValue({
        id: 'ticket-1',
        status: 'IN_PROGRESS',
      });

      const req = new Request('http://localhost/api/employee/my/tickets/ticket-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: 'ticket-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(updateTicketStatusByEmployee).toHaveBeenCalledWith({
        ticketId: 'ticket-1',
        nextStatus: 'IN_PROGRESS',
        actorEmployeeId: 'emp-1',
      });
    });
  });
});
