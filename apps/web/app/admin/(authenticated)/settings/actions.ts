'use server';

import { checkSuperAdmin } from '@/lib/admin-auth';
import { updateSystemSettingWithChangelog } from '@/lib/data-access/settings';
import { UpdateSettingsInput } from '@/lib/validations';
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
