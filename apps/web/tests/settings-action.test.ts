import { updateSettings } from '../app/admin/(authenticated)/settings/actions';
import { checkSuperAdmin } from '@/lib/admin-auth';
import {
  updateSystemSettingWithChangelog,
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
} from '@repo/database';

jest.mock('@/lib/admin-auth', () => ({
  checkSuperAdmin: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  updateSystemSettingWithChangelog: jest.fn(),
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING: 'OFFICE_ATTENDANCE_MAX_DISTANCE_METERS',
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING: 'OFFICE_JOB_TITLE_CATEGORY_MAP',
  getDefaultOfficeWorkSchedule: jest.fn(),
  updateOfficeWorkSchedule: jest.fn(),
  serializeOfficeJobTitleCategoryMap: jest.requireActual('@repo/database').serializeOfficeJobTitleCategoryMap,
  assertNoDuplicateOfficeJobTitles: jest.requireActual('@repo/database').assertNoDuplicateOfficeJobTitles,
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('updateSettings Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkSuperAdmin as jest.Mock).mockResolvedValue({ id: 'admin-1' });
  });

  test('fails if value is not a positive number for grace period settings', async () => {
    const formData = new FormData();
    formData.append('value:GEOFENCE_GRACE_MINUTES', 'not-a-number');
    formData.append('value:LOCATION_DISABLED_GRACE_MINUTES', '-5');

    const result = await updateSettings({ success: false }, formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain('must be a positive number');
    expect(updateSystemSettingWithChangelog).not.toHaveBeenCalled();
  });

  test('rejects duplicate office job titles across categories', async () => {
    const formData = new FormData();
    formData.append('officeJobTitles:staff', 'Supervisor');
    formData.append('officeJobTitles:management', ' supervisor ');

    const result = await updateSettings({ success: false }, formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain('assigned to both');
    expect(updateSystemSettingWithChangelog).not.toHaveBeenCalled();
  });

  test('rejects invalid office attendance max distance', async () => {
    const formData = new FormData();
    formData.append('officeAttendanceMaxDistance', '0');

    const result = await updateSettings({ success: false }, formData);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Office attendance max distance must be a positive number');
  });

  test('successfully updates general settings plus office categorization settings', async () => {
    const formData = new FormData();
    formData.append('value:GEOFENCE_GRACE_MINUTES', '10');
    formData.append('value:LOCATION_DISABLED_GRACE_MINUTES', '3');
    formData.append('officeJobTitles:staff', 'Receptionist\nSupport Officer');
    formData.append('officeJobTitles:management', 'Branch Manager');
    formData.append('officeAttendanceMaxDistance', '15');

    const result = await updateSettings({ success: false }, formData);

    expect(result.success).toBe(true);
    expect(updateSystemSettingWithChangelog).toHaveBeenCalledWith(
      OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
      '{"staff":["Receptionist","Support Officer"],"management":["Branch Manager"]}',
      'admin-1',
      expect.any(String)
    );
    expect(updateSystemSettingWithChangelog).toHaveBeenCalledWith(
      OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
      '15',
      'admin-1',
      expect.any(String)
    );
    expect(updateSystemSettingWithChangelog).toHaveBeenCalledTimes(4);
  });
});
