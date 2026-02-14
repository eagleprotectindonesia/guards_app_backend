import { POST } from '../app/api/employee/shifts/[id]/heartbeat/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { recordHeartbeat } from '@repo/database';
import { redis } from '@/lib/redis';

// Mock the dependencies
jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  recordHeartbeat: jest.fn(),
}));

jest.mock('@/lib/redis', () => ({
  redis: {
    publish: jest.fn(),
  },
}));

// Helper to mock NextResponse.json
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

describe('POST /api/employee/shifts/[id]/heartbeat', () => {
  const shiftId = 'shift-123';
  const employeeId = 'employee-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully records heartbeat and resolves alerts', async () => {
    const mockEmployee = { id: employeeId };
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

    const now = new Date();
    const mockShift = {
      id: shiftId,
      employeeId: employeeId,
      siteId: 'site-789',
      lastDeviceHeartbeatAt: now,
      site: { id: 'site-789', name: 'Test Site' },
    };

    const mockAlerts = [
      { id: 'alert-1', reason: 'location_services_disabled', shiftId },
    ];

    (recordHeartbeat as jest.Mock).mockResolvedValue({
      updatedShift: mockShift,
      resolvedAlerts: mockAlerts,
    });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/heartbeat`, {
      method: 'POST',
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.lastHeartbeatAt).toBe(now);

    // Verify recordHeartbeat call
    expect(recordHeartbeat).toHaveBeenCalledWith({
      shiftId,
      employeeId,
    });

    // Verify Redis publication for resolved alerts
    expect(redis.publish).toHaveBeenCalledTimes(1);
    expect(redis.publish).toHaveBeenCalledWith(
      `alerts:site:site-789`,
      expect.stringContaining('alert-1')
    );
  });

  test('returns 401 if not authenticated', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(null);

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/heartbeat`, {
      method: 'POST',
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  test('returns 404 if shift not found or not assigned', async () => {
    const mockEmployee = { id: employeeId };
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

    (recordHeartbeat as jest.Mock).mockResolvedValue({
      updatedShift: null,
      resolvedAlerts: [],
    });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/heartbeat`, {
      method: 'POST',
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Shift not found or not assigned to you');
  });

  test('returns 500 on internal error', async () => {
    const mockEmployee = { id: employeeId };
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

    (recordHeartbeat as jest.Mock).mockRejectedValue(new Error('DB Error'));

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/heartbeat`, {
      method: 'POST',
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal Server Error');
  });
});
