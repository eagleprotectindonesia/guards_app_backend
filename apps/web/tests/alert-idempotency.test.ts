import { POST } from '../app/api/employee/alerts/report/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    shift: {
      findUnique: jest.fn(),
    },
    alert: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/redis', () => ({
  redis: {
    publish: jest.fn(),
  },
}));

// Helper to mock NextResponse
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
    (prisma.shift.findUnique as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId: employeeId,
      siteId: siteId,
      site: { id: siteId, name: 'Test Site' },
    });

    const existingAlert = {
      id: 'existing-alert-id',
      shiftId,
      reason: 'geofence_breach',
      resolvedAt: null,
    };

    // Mock finding existing active alert
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(existingAlert);

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
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  test('creates new alert if none exist or previous are resolved', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (prisma.shift.findUnique as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId: employeeId,
      siteId: siteId,
      site: { id: siteId, name: 'Test Site' },
    });

    // Mock no existing active alert
    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'new-alert-id', siteId });

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
    expect(prisma.alert.create).toHaveBeenCalled();
  });

  test('succeeds even if Redis publish fails', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (prisma.shift.findUnique as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId: employeeId,
      siteId: siteId,
      site: { id: siteId, name: 'Test Site' },
    });

    (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'new-alert-id', siteId });
    
    const { redis } = require('@/lib/redis');
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

    // It should still return 200 because the alert WAS created in DB
    expect(response.status).toBe(200);
    expect(data.alertId).toBe('new-alert-id');
  });
});
