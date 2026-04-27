import { POST } from '../app/api/employee/shifts/[id]/checkin/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getShiftById, getSystemSetting, recordBulkCheckins, recordCheckin } from '@repo/database';
import { redis } from '@repo/database/redis';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getShiftById: jest.fn(),
  getSystemSetting: jest.fn(),
  recordCheckin: jest.fn(),
  recordBulkCheckins: jest.fn(),
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

describe('POST /api/employee/shifts/[id]/checkin', () => {
  const shiftId = 'shift-123';
  const employeeId = 'employee-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully marks shift as completed on last slot check-in', async () => {
    const now = new Date('2025-12-20T10:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      lastHeartbeatAt: new Date('2025-12-20T09:00:00Z'),
      status: 'in_progress',
      siteId: 'site-1',
      site: { latitude: null, longitude: null },
    });
    (getSystemSetting as jest.Mock).mockResolvedValue(null);
    (recordCheckin as jest.Mock).mockResolvedValue({ checkin: { id: 'checkin-1', status: 'on_time' } });
    (recordBulkCheckins as jest.Mock).mockResolvedValue({ count: 1, resolvedAlerts: [] });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ source: 'web' }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: shiftId }) });
    const data = await response.json();

    expect(data.isLastSlot).toBe(true);
    expect(recordCheckin).toHaveBeenCalledWith(
      expect.objectContaining({
        shiftUpdateData: expect.objectContaining({
          status: 'completed',
        }),
      })
    );

    jest.useRealTimers();
  });

  test('returns code when already checked in for the interval', async () => {
    const now = new Date('2025-12-20T09:50:00Z');
    jest.useFakeTimers().setSystemTime(now);

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      lastHeartbeatAt: new Date('2025-12-20T09:48:00Z'),
      status: 'in_progress',
      siteId: 'site-1',
      site: { latitude: null, longitude: null },
    });
    (getSystemSetting as jest.Mock).mockResolvedValue(null);

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ source: 'web' }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: shiftId }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'checkin_interval_completed',
      error: 'Already checked in for this interval',
    });

    jest.useRealTimers();
  });

  test('returns distance details when employee is too far from the site', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-12-20T08:30:00Z'));

    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      lastHeartbeatAt: null,
      status: 'in_progress',
      siteId: 'site-1',
      site: { latitude: 0, longitude: 0 },
    });
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '100' });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({
        source: 'web',
        location: { lat: 0, lng: 0.002 },
      }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: shiftId }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('too_far_from_site');
    expect(data.details).toMatchObject({
      maxDistanceMeters: 100,
    });
    expect(typeof data.details.currentDistanceMeters).toBe('number');

    jest.useRealTimers();
  });
});
