import { GET } from '../app/api/employee/settings/route';
import { verifyEmployeeSession } from '@/lib/employee-auth';
import { getSystemSettingsByName } from '@repo/database';

// Mock dependencies
jest.mock('@/lib/employee-auth', () => ({
  verifyEmployeeSession: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  getSystemSettingsByName: jest.fn(),
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
    (getSystemSettingsByName as jest.Mock).mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.GEOFENCE_GRACE_MINUTES).toBe(5);
    expect(data.LOCATION_DISABLED_GRACE_MINUTES).toBe(2);
    expect(data.OFFICE_ATTENDANCE_REQUIRE_PHOTO).toBe(false);
  });

  test('returns sanitized values if DB contains invalid data', async () => {
    (verifyEmployeeSession as jest.Mock).mockResolvedValue(true);
    (getSystemSettingsByName as jest.Mock).mockResolvedValue([
      { name: 'GEOFENCE_GRACE_MINUTES', value: 'not-a-number' },
      { name: 'LOCATION_DISABLED_GRACE_MINUTES', value: '-10' },
      { name: 'OFFICE_ATTENDANCE_REQUIRE_PHOTO', value: 'invalid' },
    ]);

    const response = await GET();
    const data = await response.json();

    // THIS IS EXPECTED TO FAIL IF IT RETURNS NaN or negative values (depending on our policy)
    // We want it to be robust and return defaults if invalid
    expect(data.GEOFENCE_GRACE_MINUTES).toBe(5);
    expect(data.LOCATION_DISABLED_GRACE_MINUTES).toBe(2);
    expect(data.OFFICE_ATTENDANCE_REQUIRE_PHOTO).toBe(false);
  });
});
