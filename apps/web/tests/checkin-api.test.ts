import { POST } from '../app/api/employee/shifts/[id]/checkin/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getShiftById } from '@/lib/data-access/shifts';
import { recordCheckin } from '@/lib/data-access/checkins';
import { getSystemSetting } from '@/lib/data-access/settings';

// Mock the dependencies
jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

jest.mock('@/lib/data-access/shifts', () => ({
  getShiftById: jest.fn(),
}));

jest.mock('@/lib/data-access/checkins', () => ({
  recordCheckin: jest.fn(),
}));

jest.mock('@/lib/data-access/settings', () => ({
  getSystemSetting: jest.fn(),
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

describe('POST /api/employee/shifts/[id]/checkin - Last Slot Case', () => {
  const shiftId = 'shift-123';
  const employeeId = 'employee-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully marks shift as completed on last slot check-in', async () => {
    const now = new Date('2025-12-20T10:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockEmployee = { id: employeeId };
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

    const mockShift = {
      id: shiftId,
      employeeId: employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      lastHeartbeatAt: null,
      status: 'in_progress',
      site: { latitude: null, longitude: null },
      shiftType: {},
      employee: mockEmployee,
    };

    (getShiftById as jest.Mock).mockResolvedValue(mockShift);
    (getSystemSetting as jest.Mock).mockResolvedValue(null);
    (recordCheckin as jest.Mock).mockResolvedValue({ id: 'checkin-1' });

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ source: 'web' }),
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(data.isLastSlot).toBe(true);
    
    // Verify recordCheckin call includes status: 'completed' in shiftUpdateData
    expect(recordCheckin).toHaveBeenCalledWith(expect.objectContaining({
      shiftUpdateData: expect.objectContaining({
        status: 'completed',
      }),
    }));

    jest.useRealTimers();
  });

  test('returns 400 when already checked in for the last slot (duplicate prevention)', async () => {
    // Current time is 09:50 (within early window for 10:00 slot)
    const now = new Date('2025-12-20T09:50:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockEmployee = { id: employeeId };
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue(mockEmployee);

    const mockShift = {
      id: shiftId,
      employeeId: employeeId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      // lastHeartbeatAt is 09:48 (already checked in for the last slot early)
      lastHeartbeatAt: new Date('2025-12-20T09:48:00Z'),
      status: 'in_progress',
      site: { latitude: null, longitude: null },
      shiftType: {},
      employee: mockEmployee,
    };

    (getShiftById as jest.Mock).mockResolvedValue(mockShift);
    (getSystemSetting as jest.Mock).mockResolvedValue(null);

    const req = new Request(`http://localhost/api/employee/shifts/${shiftId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ source: 'web' }),
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Already checked in for this interval');

    jest.useRealTimers();
  });
});
