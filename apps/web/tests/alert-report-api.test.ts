import { POST } from '../app/api/employee/alerts/report/route';
import { POST as resolvePOST } from '../app/api/employee/alerts/resolve/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

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
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
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

describe('Alert API', () => {
  const shiftId = '550e8400-e29b-41d4-a716-446655440000';
  const employeeId = 'employee-456';
  const siteId = 'site-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/employee/alerts/report', () => {
    test('successfully reports geofence_breach alert', async () => {
      const mockEmployee = { id: employeeId };
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

      const mockShift = {
        id: shiftId,
        employeeId: employeeId,
        siteId: siteId,
        site: { id: siteId, name: 'Test Site' },
      };
      (prisma.shift.findUnique as jest.Mock).mockResolvedValue(mockShift);

      const mockAlert = {
        id: 'alert-abc',
        shiftId,
        siteId,
        reason: 'geofence_breach',
      };
      (prisma.alert.create as jest.Mock).mockResolvedValue(mockAlert);

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
      expect(data.alertId).toBe('alert-abc');
    });
  });

  describe('POST /api/employee/alerts/resolve', () => {
    test('successfully resolves active alerts', async () => {
      const mockEmployee = { id: employeeId };
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

      const mockShift = {
        id: shiftId,
        employeeId: employeeId,
        siteId: siteId,
      };
      (prisma.shift.findUnique as jest.Mock).mockResolvedValue(mockShift);

      const mockAlerts = [{ id: 'alert-1', siteId }];
      (prisma.alert.findMany as jest.Mock).mockResolvedValue(mockAlerts);
      (prisma.alert.update as jest.Mock).mockResolvedValue({ ...mockAlerts[0], resolvedAt: new Date() });

      const req = new Request('http://localhost/api/employee/alerts/resolve', {
        method: 'POST',
        body: JSON.stringify({
          shiftId,
          reason: 'geofence_breach',
        }),
      });

      const response = await resolvePOST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('1 alert(s) resolved successfully');
      expect(prisma.alert.update).toHaveBeenCalled();
      expect(redis.publish).toHaveBeenCalled();
    });

    test('returns message when no active alerts found', async () => {
      const mockEmployee = { id: employeeId };
      (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

      const mockShift = {
        id: shiftId,
        employeeId: employeeId,
      };
      (prisma.shift.findUnique as jest.Mock).mockResolvedValue(mockShift);
      (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);

      const req = new Request('http://localhost/api/employee/alerts/resolve', {
        method: 'POST',
        body: JSON.stringify({
          shiftId,
          reason: 'geofence_breach',
        }),
      });

      const response = await resolvePOST(req);
      const data = await response.json();

      expect(data.message).toBe('No active alerts to resolve');
    });
  });
});

