import { POST } from '../../app/api/employee/alerts/report/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getShiftById, findOpenAlertByShiftAndReason, createAlert } from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getShiftById: jest.fn(),
  findOpenAlertByShiftAndReason: jest.fn(),
  createAlert: jest.fn(),
}));

jest.mock('@repo/database/redis', () => ({
  redis: {
    publish: jest.fn(),
  },
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

describe('Alert Report Idempotency', () => {
  const shiftId = '550e8400-e29b-41d4-a716-446655440000';
  const employeeId = '550e8400-e29b-41d4-a716-446655440001';
  const siteId = '550e8400-e29b-41d4-a716-446655440002';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not create duplicate alert if one is already active', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      siteId,
      site: { id: siteId, name: 'Test Site' },
    });

    const existingAlert = {
      id: 'existing-alert-id',
      shiftId,
      reason: 'geofence_breach',
      resolvedAt: null,
    };

    (findOpenAlertByShiftAndReason as jest.Mock).mockResolvedValue(existingAlert);

    const req = new Request('http://localhost/api/employee/alerts/report', {
      method: 'POST',
      body: JSON.stringify({
        shiftId,
        reason: 'geofence_breach',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alertId).toBe('existing-alert-id');
    expect(data.message).toContain('Alert already exists');
    expect(createAlert as jest.Mock).not.toHaveBeenCalled();
  });

  test('creates new alert if none exist or previous are resolved', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      siteId,
      site: { id: siteId, name: 'Test Site' },
    });

    (findOpenAlertByShiftAndReason as jest.Mock).mockResolvedValue(null);
    (createAlert as jest.Mock).mockResolvedValue({ id: 'new-alert-id', siteId });

    const req = new Request('http://localhost/api/employee/alerts/report', {
      method: 'POST',
      body: JSON.stringify({
        shiftId,
        reason: 'geofence_breach',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alertId).toBe('new-alert-id');
    expect(createAlert as jest.Mock).toHaveBeenCalled();
  });

  test('succeeds even if Redis publish fails', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      siteId,
      site: { id: siteId, name: 'Test Site' },
    });

    (findOpenAlertByShiftAndReason as jest.Mock).mockResolvedValue(null);
    (createAlert as jest.Mock).mockResolvedValue({ id: 'new-alert-id', siteId });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { redis } = require('@repo/database/redis');
    (redis.publish as jest.Mock).mockRejectedValue(new Error('Redis connection lost'));

    const req = new Request('http://localhost/api/employee/alerts/report', {
      method: 'POST',
      body: JSON.stringify({
        shiftId,
        reason: 'geofence_breach',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alertId).toBe('new-alert-id');
  });
});
