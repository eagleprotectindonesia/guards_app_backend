import { POST } from '../app/api/employee/shifts/[id]/attendance/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getShiftById, getSystemSetting } from '@repo/database';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getShiftById: jest.fn(),
  getSystemSetting: jest.fn(),
  recordAttendance: jest.fn(),
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

describe('POST /api/employee/shifts/[id]/attendance', () => {
  const shiftId = '11111111-1111-4111-8111-111111111111';
  const employeeId = 'employee-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns code when attendance is already recorded', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      attendance: { id: 'attendance-1' },
      site: { latitude: null, longitude: null },
      status: 'scheduled',
    });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/attendance`, {
      method: 'POST',
      body: JSON.stringify({
        shiftId,
        location: { lat: 0, lng: 0 },
      }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: shiftId }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      code: 'attendance_already_recorded',
      error: 'Attendance already recorded for this shift',
    });
  });

  test('returns distance details when employee is too far from the site', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({ id: employeeId });
    (getShiftById as jest.Mock).mockResolvedValue({
      id: shiftId,
      employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      attendance: null,
      site: { latitude: 0, longitude: 0 },
      status: 'scheduled',
    });
    (getSystemSetting as jest.Mock).mockResolvedValue({ value: '100' });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/attendance`, {
      method: 'POST',
      body: JSON.stringify({
        shiftId,
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
  });
});
