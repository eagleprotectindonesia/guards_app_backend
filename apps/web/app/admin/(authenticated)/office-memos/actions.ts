'use server';

import { revalidatePath } from 'next/cache';
import { createOfficeMemo, deleteOfficeMemo, updateOfficeMemo } from '@repo/database';
import { officeMemoSchema, OfficeMemoInput } from '@repo/validations';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { ActionState } from '@/types/actions';

function revalidateOfficeMemoPaths() {
  revalidatePath('/admin/office-memos');
}

function parseBooleanFormField(formData: FormData, fieldName: string) {
  return formData.getAll(fieldName).some(value => String(value) === 'true');
}

function parseFormData(formData: FormData) {
  return officeMemoSchema.safeParse({
    startDate: String(formData.get('startDate') || ''),
    endDate: String(formData.get('endDate') || ''),
    title: String(formData.get('title') || '').trim(),
    message: String(formData.get('message') || '').trim() || undefined,
    scope: String(formData.get('scope') || ''),
    departmentKeys: formData
      .getAll('departmentKeys')
      .map(value => String(value).trim().toLowerCase())
      .filter(Boolean),
    isActive: parseBooleanFormField(formData, 'isActive'),
  });
}

export async function createOfficeMemoAction(
  prevState: ActionState<OfficeMemoInput>,
  formData: FormData
): Promise<ActionState<OfficeMemoInput>> {
  const session = await requirePermission(PERMISSIONS.OFFICE_MEMOS.CREATE);
  const parsed = parseFormData(formData);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message || 'Invalid input.',
    };
  }

  try {
    await createOfficeMemo(parsed.data, session.id);
    revalidateOfficeMemoPaths();
    return { success: true, message: 'Office memo created successfully.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create office memo.',
    };
  }
}

export async function updateOfficeMemoAction(
  id: string,
  prevState: ActionState<OfficeMemoInput>,
  formData: FormData
): Promise<ActionState<OfficeMemoInput>> {
  const session = await requirePermission(PERMISSIONS.OFFICE_MEMOS.EDIT);
  const parsed = parseFormData(formData);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message || 'Invalid input.',
    };
  }

  try {
    await updateOfficeMemo(id, parsed.data, session.id);
    revalidateOfficeMemoPaths();
    return { success: true, message: 'Office memo updated successfully.' };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update office memo.',
    };
  }
}

export async function deleteOfficeMemoAction(id: string) {
  const session = await requirePermission(PERMISSIONS.OFFICE_MEMOS.DELETE);

  try {
    await deleteOfficeMemo(id, session.id);
    revalidateOfficeMemoPaths();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete office memo.',
    };
  }
}
