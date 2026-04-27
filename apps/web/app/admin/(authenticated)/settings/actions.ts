'use server';

import { checkSuperAdmin } from '@/lib/admin-auth';
import {
  assertNoDuplicateOfficeJobTitles,
  OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING,
  OFFICE_ATTENDANCE_REQUIRE_PHOTO_SETTING,
  OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING,
  serializeOfficeJobTitleCategoryMap,
} from '@repo/shared';
import {
  getDefaultOfficeWorkSchedule,
  updateOfficeWorkSchedule,
  updateSystemSettingWithChangelog,
} from '@repo/database';
import { UpdateDefaultOfficeWorkScheduleInput, UpdateSettingsInput, updateDefaultOfficeWorkScheduleSchema } from '@repo/validations';
import { ActionState } from '@/types/actions';
import { revalidatePath } from 'next/cache';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';

const OFFICE_JOB_TITLE_CATEGORY_MAP_NOTE =
  'Maps external office employee job titles into the staff and management categories.';
const OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_NOTE =
  'Maximum allowed distance (in meters) between an office employee and office coordinates for future office attendance enforcement.';
const OFFICE_ATTENDANCE_REQUIRE_PHOTO_NOTE =
  'Require office attendance photo capture during clock-in (1=enabled, 0=disabled).';

function parseTitleList(rawValue: FormDataEntryValue | null) {
  if (typeof rawValue !== 'string') return [];
  return rawValue
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

export async function updateSettings(
  prevState: ActionState<UpdateSettingsInput>,
  formData: FormData
): Promise<ActionState<UpdateSettingsInput>> {
  const currentAdmin = await checkSuperAdmin();
  if (!currentAdmin) {
    return {
      message: 'Unauthorized: Only Super Admins can manage settings.',
      success: false,
    };
  }

  // Parse fields like "value:NAME" and "note:NAME"
  const settingsMap: Record<string, { value?: string; note?: string }> = {};

  const officeJobTitleCategoryMap = {
    staff: parseTitleList(formData.get('officeJobTitles:staff')),
    management: parseTitleList(formData.get('officeJobTitles:management')),
  };
  const officeAttendanceMaxDistance = formData.get('officeAttendanceMaxDistance');
  const officeAttendanceRequirePhoto = formData.get('officeAttendanceRequirePhoto');
  
  formData.forEach((val, key) => {
    if (typeof val !== 'string' || key.startsWith('$')) return;
    if (key.startsWith('officeJobTitles:') || key === 'officeAttendanceMaxDistance' || key === 'officeAttendanceRequirePhoto') return;
    
    const [field, name] = key.split(':');
    if (!name) return;
    
    if (!settingsMap[name]) settingsMap[name] = {};
    if (field === 'value') settingsMap[name].value = val;
    if (field === 'note') settingsMap[name].note = val;
  });

  // Validation
  const numericSettings = ['GEOFENCE_GRACE_MINUTES', 'LOCATION_DISABLED_GRACE_MINUTES'];
  for (const name of numericSettings) {
    if (settingsMap[name]?.value !== undefined) {
      const val = parseInt(settingsMap[name].value, 10);
      if (isNaN(val) || val <= 0) {
        return {
          success: false,
          message: `Setting ${name.replace(/_/g, ' ')} must be a positive number.`,
        };
      }
    }
  }

  try {
    assertNoDuplicateOfficeJobTitles(officeJobTitleCategoryMap);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Job title categories contain duplicate titles.',
    };
  }

  if (typeof officeAttendanceMaxDistance === 'string' && officeAttendanceMaxDistance.trim()) {
    const val = parseInt(officeAttendanceMaxDistance, 10);
    if (isNaN(val) || val <= 0) {
      return {
        success: false,
        message: 'Office attendance max distance must be a positive number.',
      };
    }
  }

  settingsMap[OFFICE_JOB_TITLE_CATEGORY_MAP_SETTING] = {
    value: serializeOfficeJobTitleCategoryMap(officeJobTitleCategoryMap),
    note: OFFICE_JOB_TITLE_CATEGORY_MAP_NOTE,
  };
  settingsMap[OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_SETTING] = {
    value: typeof officeAttendanceMaxDistance === 'string' && officeAttendanceMaxDistance.trim() ? officeAttendanceMaxDistance.trim() : '10',
    note: OFFICE_ATTENDANCE_MAX_DISTANCE_METERS_NOTE,
  };
  settingsMap[OFFICE_ATTENDANCE_REQUIRE_PHOTO_SETTING] = {
    value: officeAttendanceRequirePhoto === '1' ? '1' : '0',
    note: OFFICE_ATTENDANCE_REQUIRE_PHOTO_NOTE,
  };

  try {
    await Promise.all(
      Object.entries(settingsMap).map(([name, { value, note }]) => 
        updateSystemSettingWithChangelog(name, value || '', currentAdmin.id, note)
      )
    );

    revalidatePath('/admin/settings');
    return {
      success: true,
      message: 'Settings updated successfully.',
    };
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Settings.',
      success: false,
    };
  }
}

export async function updateDefaultOfficeWorkSchedule(
  prevState: ActionState<UpdateDefaultOfficeWorkScheduleInput>,
  formData: FormData
): Promise<ActionState<UpdateDefaultOfficeWorkScheduleInput>> {
  if (!isOfficeWorkSchedulesEnabled()) {
    return {
      success: false,
      message: 'Office schedules are currently disabled.',
    };
  }

  const currentAdmin = await checkSuperAdmin();
  if (!currentAdmin) {
    return {
      message: 'Unauthorized: Only Super Admins can manage settings.',
      success: false,
    };
  }

  const daysRaw = formData.get('days');
  let parsedDays: unknown = [];

  if (typeof daysRaw === 'string') {
    try {
      parsedDays = JSON.parse(daysRaw);
    } catch {
      parsedDays = [];
    }
  }

  const validatedFields = updateDefaultOfficeWorkScheduleSchema.safeParse({
    days: parsedDays,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid schedule data. Failed to update default office schedule.',
      success: false,
    };
  }

  try {
    const defaultSchedule = await getDefaultOfficeWorkSchedule();

    await updateOfficeWorkSchedule({
      id: defaultSchedule.id,
      name: defaultSchedule.name,
      days: validatedFields.data.days,
    });
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update default office schedule.',
      success: false,
    };
  }

  revalidatePath('/admin/settings');
  return {
    success: true,
    message: 'Default office schedule updated successfully.',
  };
}
