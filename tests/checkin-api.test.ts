import { POST } from '../app/api/shifts/[id]/checkin/route';
import { prisma } from '../lib/prisma';
import { getAuthenticatedGuard } from '../lib/guard-auth';

// Mock the dependencies
jest.mock('../lib/prisma', () => {
  const { mockDeep } = jest.requireActual('jest-mock-extended');
  return {
    __esModule: true,
    prisma: mockDeep<import('@prisma/client').PrismaClient>(),
  };
});

jest.mock('../lib/guard-auth', () => ({
  getAuthenticatedGuard: jest.fn(),
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

describe('POST /api/shifts/[id]/checkin - Last Slot Case', () => {
  const shiftId = 'shift-123';
  const guardId = 'guard-456';

  beforeEach(() => {
    const { mockReset } = jest.requireActual('jest-mock-extended');
    mockReset(prisma as any);
    jest.clearAllMocks();
  });

  test('successfully marks shift as completed on last slot check-in', async () => {
    const now = new Date('2025-12-20T10:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockGuard = { id: guardId };
    (getAuthenticatedGuard as jest.Mock).mockResolvedValue(mockGuard);

    const mockShift = {
      id: shiftId,
      guardId: guardId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      lastHeartbeatAt: null,
      status: 'in_progress',
      site: { latitude: null, longitude: null },
      shiftType: {},
      guard: mockGuard,
    };

    (prisma.shift.findUnique as jest.Mock).mockResolvedValue(mockShift);

    // Mock transaction
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
      return cb(prisma);
    });

    (prisma.checkin.create as jest.Mock).mockResolvedValue({ id: 'checkin-1' });
    (prisma.shift.update as jest.Mock).mockResolvedValue({ ...mockShift, status: 'completed' });

    const req = new Request(`http://localhost/api/shifts/${shiftId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ source: 'web' }),
    });

    const params = Promise.resolve({ id: shiftId });
    const response = await POST(req, { params });
    const data = await response.json();

    expect(data.isLastSlot).toBe(true);
    
    // Verify shift update call includes status: 'completed'
    expect(prisma.shift.update).toHaveBeenCalledWith({
      where: { id: shiftId },
      data: expect.objectContaining({
        status: 'completed',
      }),
    });

    jest.useRealTimers();
  });

  test('returns 400 when already checked in for the last slot (duplicate prevention)', async () => {
    // Current time is 09:50 (within early window for 10:00 slot)
    const now = new Date('2025-12-20T09:50:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockGuard = { id: guardId };
    (getAuthenticatedGuard as jest.Mock).mockResolvedValue(mockGuard);

    const mockShift = {
      id: shiftId,
      guardId: guardId,
      startsAt: new Date('2025-12-20T08:00:00Z'),
      endsAt: new Date('2025-12-20T10:00:00Z'),
      requiredCheckinIntervalMins: 60,
      graceMinutes: 15,
      // lastHeartbeatAt is 09:48 (already checked in for the last slot early)
      lastHeartbeatAt: new Date('2025-12-20T09:48:00Z'),
      status: 'in_progress',
      site: { latitude: null, longitude: null },
      shiftType: {},
      guard: mockGuard,
    };

    (prisma.shift.findUnique as jest.Mock).mockResolvedValue(mockShift);

    const req = new Request(`http://localhost/api/shifts/${shiftId}/checkin`, {
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