'use server';

import { checkSuperAdmin } from '@/lib/admin-auth';
import {
  getDefaultOfficeWorkSchedule,
  updateOfficeWorkSchedule,
  updateSystemSettingWithChangelog,
} from '@repo/database';
import { UpdateDefaultOfficeWorkScheduleInput, UpdateSettingsInput, updateDefaultOfficeWorkScheduleSchema } from '@repo/validations';
import { ActionState } from '@/types/actions';
import { revalidatePath } from 'next/cache';

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
  
  formData.forEach((val, key) => {
    if (typeof val !== 'string' || key.startsWith('$')) return;
    
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
