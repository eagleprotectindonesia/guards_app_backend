import { updateSettings } from '../app/admin/(authenticated)/settings/actions';
import { checkSuperAdmin } from '@/lib/admin-auth';
import { updateSystemSettingWithChangelog } from '@/lib/data-access/settings';

// Mock dependencies
jest.mock('@/lib/admin-auth', () => ({
  checkSuperAdmin: jest.fn(),
}));

jest.mock('@/lib/data-access/settings', () => ({
  updateSystemSettingWithChangelog: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('updateSettings Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fails if value is not a positive number for grace period settings', async () => {
    (checkSuperAdmin as jest.Mock).mockResolvedValue({ id: 'admin-1' });

    const formData = new FormData();
    formData.append('value:GEOFENCE_GRACE_MINUTES', 'not-a-number');
    formData.append('value:LOCATION_DISABLED_GRACE_MINUTES', '-5');

    const result = await updateSettings({ success: false }, formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain('must be a positive number');
    expect(updateSystemSettingWithChangelog).not.toHaveBeenCalled();
  });

  test('successfully updates with valid numeric values', async () => {
    (checkSuperAdmin as jest.Mock).mockResolvedValue({ id: 'admin-1' });

    const formData = new FormData();
    formData.append('value:GEOFENCE_GRACE_MINUTES', '10');
    formData.append('value:LOCATION_DISABLED_GRACE_MINUTES', '3');

    const result = await updateSettings({ success: false }, formData);

    expect(result.success).toBe(true);
    expect(updateSystemSettingWithChangelog).toHaveBeenCalledTimes(2);
  });
});
