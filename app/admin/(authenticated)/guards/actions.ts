'use server';

import { prisma } from '@/lib/prisma';
import { createGuardSchema, updateGuardSchema, updateGuardPasswordSchema } from '@/lib/validations';
import { hashPassword, serialize, Serialized } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { Guard } from '@prisma/client';
import { parse, isValid } from 'date-fns';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

export type ActionState = {
  message?: string;
  errors?: {
    name?: string[];
    phone?: string[];
    employeeId?: string[];
    password?: string[];
    confirmPassword?: string[];
    guardCode?: string[];
    status?: string[];
    joinDate?: string[];
    leftDate?: string[];
    note?: string[];
  };
  success?: boolean;
};

export async function getAllGuardsForExport(): Promise<Serialized<Guard>[]> {
  const guards = await prisma.guard.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return serialize(guards);
}

export async function createGuard(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createGuardSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    employeeId: formData.get('employeeId')?.toString() || undefined,
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
      lastUpdatedById: adminId,
    };

    await prisma.guard.create({
      data: dataToCreate,
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      // Check for unique constraint violation
      if (error.code === 'P2002') {
        const target = error.meta?.target as string[];
        if (target?.includes('phone')) {
          return {
            message: 'A guard with this phone number already exists.',
            success: false,
          };
        }
        if (target?.includes('employee_id')) {
          return {
            message: 'A guard with this employee ID already exists.',
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

export async function updateGuard(id: string, prevState: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = updateGuardSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    employeeId: formData.get('employeeId')?.toString() || undefined,
    guardCode: formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || undefined,
    note: formData.get('note')?.toString() || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Guard.',
      success: false,
    };
  }

  try {
    await prisma.guard.update({
      where: { id },
      data: {
        ...validatedFields.data,
        lastUpdatedById: adminId,
      },
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = error.meta?.target as string[];
        if (target?.includes('phone')) {
          return {
            message: 'A guard with this phone number already exists.',
            success: false,
          };
        }
        if (target?.includes('employee_id')) {
          return {
            message: 'A guard with this employee ID already exists.',
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
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
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
    await prisma.guard.update({
      where: { id },
      data: { hashedPassword },
    });
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
    await prisma.guard.delete({
      where: { id },
    });
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
  const guardsToCreate: Pick<
    Guard,
    | 'name'
    | 'phone'
    | 'employeeId'
    | 'guardCode'
    | 'note'
    | 'joinDate'
    | 'hashedPassword'
    | 'status'
    | 'lastUpdatedById'
  >[] = [];
  const phonesToCheck: string[] = [];
  const employeeIdsToCheck: string[] = [];

  // Skip header row
  const startRow = 1;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split, handling basic quotes stripping
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    // Expected: Name, Phone, Employee ID, Guard Code, Note, Join Date, Password
    // At minimum, Name, Phone, Employee ID, Password, and Join Date are required.
    if (cols.length < 4) {
      errors.push(
        `Row ${i + 1}: Insufficient columns. Name, Phone, Employee ID, Password, and Join Date are required.`
      );
      continue;
    }

    const [name, phoneRaw, employeeId, guardCode, note, joinDateStr, password] = cols;
    let phone = phoneRaw;

    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    if (!name || !phone || !employeeId) {
      errors.push(`Row ${i + 1}: Name, Phone, and Employee ID are required.`);
      continue;
    }

    // Validate employee ID length and alphanumeric
    if (employeeId.length !== 6) {
      errors.push(`Row ${i + 1}: Employee ID must be exactly 6 characters.`);
      continue;
    }
    if (!/^[a-zA-Z0-9]*$/.test(employeeId)) {
      errors.push(`Row ${i + 1}: Employee ID must be alphanumeric only.`);
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
      employeeId,
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

    if (employeeIdsToCheck.includes(employeeId)) {
      errors.push(`Row ${i + 1}: Duplicate employee ID '${employeeId}' in file.`);
      continue;
    }

    phonesToCheck.push(phone);
    employeeIdsToCheck.push(employeeId);

    // Hash the password for this specific guard
    const hashedPasswordForGuard = await hashPassword(validationResult.data.password);

    guardsToCreate.push({
      name: validationResult.data.name,
      phone: validationResult.data.phone,
      employeeId: validationResult.data.employeeId,
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
    // Check for existing phones or employee IDs in DB
    const existingGuards = await prisma.guard.findMany({
      where: {
        OR: [{ phone: { in: phonesToCheck } }, { employeeId: { in: employeeIdsToCheck } }],
      },
      select: { phone: true, employeeId: true },
    });

    if (existingGuards.length > 0) {
      const existingErrors: string[] = [];
      existingGuards.forEach(g => {
        if (phonesToCheck.includes(g.phone)) {
          existingErrors.push(`Phone '${g.phone}' is already registered.`);
        }
        if (employeeIdsToCheck.includes(g.employeeId)) {
          existingErrors.push(`Employee ID '${g.employeeId}' is already registered.`);
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

    await prisma.guard.createMany({
      data: finalData,
    });

    revalidatePath('/admin/guards');
    return { success: true, message: `Successfully created ${guardsToCreate.length} guards.` };
  } catch (error) {
    console.error('Bulk Create Error:', error);
    return { success: false, message: 'Database error during bulk creation.' };
  }
}
