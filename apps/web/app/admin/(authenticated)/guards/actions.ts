'use server';

import {
  getAllGuards,
  createGuardWithChangelog,
  updateGuardWithChangelog,
  updateGuardPasswordWithChangelog,
  deleteGuardWithChangelog,
  findExistingGuards,
  bulkCreateGuardsWithChangelog,
} from '@/lib/data-access/guards';
import {
  createGuardSchema,
  updateGuardSchema,
  updateGuardPasswordSchema,
  CreateGuardInput,
  UpdateGuardInput,
  UpdateGuardPasswordInput,
} from '@/lib/validations';
import { hashPassword, serialize, Serialized } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { Guard, Prisma } from '@prisma/client';
import { parse, isValid } from 'date-fns';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { ActionState } from '@/types/actions';

export async function getAllGuardsForExport(): Promise<
  Serialized<Guard & { lastUpdatedBy?: { name: string } | null; createdBy?: { name: string } | null }>[]
> {
  const guards = await getAllGuards(undefined, true);
  return serialize(guards);
}

type PrismaUniqueConstraintMeta = {
  driverAdapterError?: {
    cause?: {
      constraint?: {
        fields?: string[];
      };
    };
  };
};

export async function createGuard(
  prevState: ActionState<CreateGuardInput>,
  formData: FormData
): Promise<ActionState<CreateGuardInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createGuardSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    id: formData.get('id')?.toString() || undefined,
    guardCode: formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || undefined,
    note: formData.get('note')?.toString() || undefined,
    password: formData.get('password')?.toString(),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Guard.',
      success: false,
    };
  }

  const { password, ...restData } = validatedFields.data;

  try {
    // Hash the password if provided
    const dataToCreate = {
      ...restData,
      hashedPassword: await hashPassword(password),
    };

    await createGuardWithChangelog(dataToCreate, adminId!);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_GUARD_CODE')) {
      const parts = error.message.split(':');
      const conflictId = parts[1];
      return {
        message: `This guard code is already in use by another active guard (ID: ${conflictId}).`,
        success: false,
      };
    }
    if (error instanceof PrismaClientKnownRequestError) {
      // Check for unique constraint violation
      if (error.code === 'P2002') {
        const meta = error.meta as PrismaUniqueConstraintMeta;
        const fields = meta?.driverAdapterError?.cause?.constraint?.fields;

        if (fields?.includes('phone')) {
          return {
            message: 'A guard with this phone number already exists.',
            success: false,
          };
        }
        if (fields?.includes('id')) {
          return {
            message: 'A guard with this ID already exists.',
            success: false,
          };
        }
        return {
          message: 'A guard with these unique details already exists.',
          success: false,
        };
      }
    }
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Guard.',
      success: false,
    };
  }

  revalidatePath('/admin/guards');
  return { success: true, message: 'Guard created successfully' };
}

export async function updateGuard(
  id: string,
  prevState: ActionState<UpdateGuardInput>,
  formData: FormData
): Promise<ActionState<UpdateGuardInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = updateGuardSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    guardCode: formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || null,
    note: formData.get('note')?.toString() || null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Guard.',
      success: false,
    };
  }

  try {
    await updateGuardWithChangelog(id, validatedFields.data, adminId!);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_GUARD_CODE')) {
      const parts = error.message.split(':');
      const conflictId = parts[1];
      return {
        message: `This guard code is already in use by another active guard (ID: ${conflictId}).`,
        success: false,
      };
    }
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const meta = error.meta as PrismaUniqueConstraintMeta;
        const fields = meta?.driverAdapterError?.cause?.constraint?.fields;

        if (fields?.includes('phone')) {
          return {
            message: 'A guard with this phone number already exists.',
            success: false,
          };
        }
        return {
          message: 'A guard with these unique details already exists.',
          success: false,
        };
      }
    }
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Guard.',
      success: false,
    };
  }

  revalidatePath('/admin/guards');
  return { success: true, message: 'Guard updated successfully' };
}

export async function updateGuardPassword(
  id: string,
  prevState: ActionState<UpdateGuardPasswordInput>,
  formData: FormData
): Promise<ActionState<UpdateGuardPasswordInput>> {
  const validatedFields = updateGuardPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input. Failed to update password.',
      success: false,
    };
  }

  try {
    const hashedPassword = await hashPassword(validatedFields.data.password);
    const adminId = await getAdminIdFromToken();

    await updateGuardPasswordWithChangelog(id, hashedPassword, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update password.',
      success: false,
    };
  }

  revalidatePath('/admin/guards');
  return { success: true, message: 'Password updated successfully' };
}

export async function deleteGuard(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    await deleteGuardWithChangelog(id, adminId!);
    revalidatePath('/admin/guards');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete guard' };
  }
}

export async function bulkCreateGuards(
  formData: FormData
): Promise<{ success: boolean; message?: string; errors?: string[] }> {
  const adminId = await getAdminIdFromToken();
  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, message: 'No file provided.' };
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 2) {
    return { success: false, message: 'CSV file is empty or missing data.' };
  }

  const errors: string[] = [];
  const guardsToCreate: Prisma.GuardCreateManyInput[] = [];
  const phonesToCheck: string[] = [];
  const idsToCheck: string[] = [];
  const phoneToRow = new Map<string, number>();
  const idToRow = new Map<string, number>();
  const guardCodeToRow = new Map<string, number>();

  // Skip header row
  const startRow = 1;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split, handling basic quotes stripping
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    // Expected: Name, Phone, ID (was Employee ID), Guard Code, Note, Join Date, Password
    // At minimum, Name, Phone, ID, Password, and Join Date are required.
    if (cols.length < 4) {
      errors.push(`Row ${i + 1}: Insufficient columns. Name, Phone, Guard ID, Password, and Join Date are required.`);
      continue;
    }

    const [name, phoneRaw, id, guardCode, note, joinDateStr, password] = cols;
    let phone = phoneRaw;

    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    if (!name || !phone || !id) {
      errors.push(`Row ${i + 1}: Name, Phone, and Guard ID are required.`);
      continue;
    }

    // Validate ID length and alphanumeric (using same rules as schema for consistency)
    if (id.length !== 6) {
      errors.push(`Row ${i + 1}: Guard ID must be exactly 6 characters.`);
      continue;
    }
    if (!/^[a-zA-Z0-9]*$/.test(id)) {
      errors.push(`Row ${i + 1}: Guard ID must be alphanumeric only.`);
      continue;
    }

    // Validate phone number length
    try {
      const phoneNumberObj = parsePhoneNumberWithError(phone);
      if (phoneNumberObj.nationalNumber.length < 6 || phoneNumberObj.nationalNumber.length > 17) {
        errors.push(`Row ${i + 1}: Phone number must be between 6 and 17 characters.`);
        continue;
      }
    } catch {
      errors.push(`Row ${i + 1}: Invalid phone number format.`);
      continue;
    }

    if (!password) {
      errors.push(`Row ${i + 1}: Password is required.`);
      continue;
    }

    if (!joinDateStr) {
      errors.push(`Row ${i + 1}: Join Date is required.`);
      continue;
    }

    // Prepare data for validation
    let joinDateISO: string | undefined = undefined;
    if (joinDateStr) {
      let d: Date | undefined;
      const cleanDateStr = joinDateStr.trim();

      // Try standard Date constructor first (handles ISO yyyy-MM-dd)
      const tryDate = new Date(cleanDateStr);
      // Valid if not NaN and year is reasonable (e.g. > 1900) to avoid "Invalid Date"
      if (!isNaN(tryDate.getTime())) {
        d = tryDate;
      } else {
        // Fallback to specific formats common in CSVs using date-fns
        const formats = ['dd/MM/yyyy', 'MM/dd/yyyy', 'dd-MM-yyyy'];
        for (const fmt of formats) {
          const parsed = parse(cleanDateStr, fmt, new Date());
          if (isValid(parsed)) {
            d = parsed;
            break;
          }
        }
      }

      if (!d || isNaN(d.getTime())) {
        errors.push(
          `Row ${i + 1}: Invalid Join Date '${joinDateStr}'. Expected YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY.`
        );
        continue;
      }
      joinDateISO = d.toISOString();
    }

    // Validate guard code if provided
    let guardCodeValue: string | undefined = undefined;
    if (guardCode) {
      if (!/^[a-zA-Z0-9]*$/.test(guardCode)) {
        errors.push(`Row ${i + 1}: Guard code must be alphanumeric only.`);
        continue;
      }
      if (guardCode.length > 12) {
        errors.push(`Row ${i + 1}: Guard code must be at most 12 characters.`);
        continue;
      }
      guardCodeValue = guardCode;
    }

    const inputData = {
      name,
      phone,
      id,
      guardCode: guardCodeValue,
      note: note || undefined,
      joinDate: joinDateISO,
      password: password,
    };

    // Use schema for validation
    const validationResult = createGuardSchema.safeParse(inputData);

    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      const errorMsg = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs?.join(', ')}`)
        .join('; ');
      errors.push(`Row ${i + 1}: ${errorMsg}`);
      continue;
    }

    if (phonesToCheck.includes(phone)) {
      errors.push(`Row ${i + 1}: Duplicate phone number '${phone}' in file.`);
      continue;
    }

    if (idsToCheck.includes(id)) {
      errors.push(`Row ${i + 1}: Duplicate Guard ID '${id}' in file.`);
      continue;
    }

    if (guardCodeValue) {
      if (guardCodeToRow.has(guardCodeValue)) {
        errors.push(`Row ${i + 1}: Duplicate guard code '${guardCodeValue}' in file.`);
        continue;
      }
      guardCodeToRow.set(guardCodeValue, i + 1);
    }

    phonesToCheck.push(phone);
    idsToCheck.push(id);
    phoneToRow.set(phone, i + 1);
    idToRow.set(id, i + 1);

    // Hash the password for this specific guard
    const hashedPasswordForGuard = await hashPassword(validationResult.data.password);

    guardsToCreate.push({
      name: validationResult.data.name,
      phone: validationResult.data.phone,
      id: validationResult.data.id,
      guardCode: validationResult.data.guardCode || null,
      note: validationResult.data.note || null,
      joinDate: validationResult.data.joinDate as unknown as Date,
      hashedPassword: hashedPasswordForGuard,
      status: true,
      lastUpdatedById: adminId || null,
    });
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed.', errors };
  }

  if (guardsToCreate.length === 0) {
    return { success: false, message: 'No valid guards found to create.' };
  }

  try {
    // Check for existing phones or IDs in DB
    const existingGuards = await findExistingGuards(phonesToCheck, idsToCheck);

    if (existingGuards.length > 0) {
      const existingErrors: string[] = [];
      existingGuards.forEach(g => {
        if (phonesToCheck.includes(g.phone)) {
          const row = phoneToRow.get(g.phone);
          existingErrors.push(`Row ${row}: Phone '${g.phone}' is already registered.`);
        }
        if (idsToCheck.includes(g.id)) {
          const row = idToRow.get(g.id);
          existingErrors.push(`Row ${row}: Guard ID '${g.id}' is already registered.`);
        }
      });
      return {
        success: false,
        message: 'Some unique identifiers already exist in the database.',
        errors: existingErrors,
      };
    }

    const finalData = guardsToCreate.map(g => ({
      ...g,
      joinDate: g.joinDate ? new Date(g.joinDate) : undefined,
    }));

    await bulkCreateGuardsWithChangelog(finalData, adminId!);

    revalidatePath('/admin/guards');
    return { success: true, message: `Successfully created ${guardsToCreate.length} guards.` };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'DUPLICATE_GUARD_CODE_IN_BATCH') {
        return { success: false, message: 'Duplicate guard codes found within the uploaded file for active guards.' };
      }
      if (error.message.startsWith('DUPLICATE_GUARD_CODE:')) {
        const parts = error.message.split(':');
        const code = parts[1];
        const conflictId = parts[2];
        const row = guardCodeToRow.get(code);
        const rowPrefix = row ? `Row ${row}: ` : '';
        return { success: false, message: `${rowPrefix}Guard code '${code}' is already in use by another active guard (ID: ${conflictId}).` };
      }
    }
    console.error('Bulk Create Error:', error);
    return { success: false, message: 'Database error during bulk creation.' };
  }
}
