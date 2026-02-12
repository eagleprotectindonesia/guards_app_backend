import { GET } from '../app/api/employee/settings/route';
import { verifyEmployeeSession } from '@/lib/employee-auth';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/employee-auth', () => ({
  verifyEmployeeSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    systemSetting: {
      findMany: jest.fn(),
    },
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

describe('Settings API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns default values if settings are missing', async () => {
    (verifyEmployeeSession as jest.Mock).mockResolvedValue(true);
    (prisma.systemSetting.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.GEOFENCE_GRACE_MINUTES).toBe(5);
    expect(data.LOCATION_DISABLED_GRACE_MINUTES).toBe(2);
  });

  test('returns sanitized values if DB contains invalid data', async () => {
    (verifyEmployeeSession as jest.Mock).mockResolvedValue(true);
    (prisma.systemSetting.findMany as jest.Mock).mockResolvedValue([
      { name: 'GEOFENCE_GRACE_MINUTES', value: 'not-a-number' },
      { name: 'LOCATION_DISABLED_GRACE_MINUTES', value: '-10' },
    ]);

    const response = await GET();
    const data = await response.json();

    // THIS IS EXPECTED TO FAIL IF IT RETURNS NaN or negative values (depending on our policy)
    // We want it to be robust and return defaults if invalid
    expect(data.GEOFENCE_GRACE_MINUTES).toBe(5);
    expect(data.LOCATION_DISABLED_GRACE_MINUTES).toBe(2);
  });
});
