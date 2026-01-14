'use server';

import {
  getAllEmployees,
  createEmployeeWithChangelog,
  updateEmployeeWithChangelog,
  updateEmployeePasswordWithChangelog,
  deleteEmployeeWithChangelog,
  findExistingEmployees,
  bulkCreateEmployeesWithChangelog,
} from '@/lib/data-access/employees';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  updateEmployeePasswordSchema,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  UpdateEmployeePasswordInput,
} from '@/lib/validations';
import { hashPassword, serialize, Serialized } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { Employee, Prisma } from '@prisma/client';
import { parse, isValid } from 'date-fns';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { ActionState } from '@/types/actions';

export async function getAllEmployeesForExport(): Promise<
  Serialized<Employee & { lastUpdatedBy?: { name: string } | null; createdBy?: { name: string } | null }>[]
> {
  const employees = await getAllEmployees(undefined, true);
  return serialize(employees);
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

export async function createEmployee(
  prevState: ActionState<CreateEmployeeInput>,
  formData: FormData
): Promise<ActionState<CreateEmployeeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = createEmployeeSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    id: formData.get('id')?.toString() || undefined,
    employeeCode: formData.get('employeeCode')?.toString() || formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || undefined,
    note: formData.get('note')?.toString() || undefined,
    password: formData.get('password')?.toString(),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Employee.',
      success: false,
    };
  }

  const { password, ...restData } = validatedFields.data;

  try {
    // Hash the password if provided
    const dataToCreate = {
      ...restData,
      hashedPassword: await hashPassword(password!),
    } as Prisma.EmployeeCreateInput;

    await createEmployeeWithChangelog(dataToCreate, adminId!)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_EMPLOYEE_CODE')) {
      const parts = error.message.split(':');
      const conflictId = parts[1];
      return {
        message: `This employee code is already in use by another active employee (ID: ${conflictId}).`,
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
            message: 'An employee with this phone number already exists.',
            success: false,
          };
        }
        if (fields?.includes('id')) {
          return {
            message: 'An employee with this ID already exists.',
            success: false,
          };
        }
        return {
          message: 'An employee with these unique details already exists.',
          success: false,
        };
      }
    }
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Create Employee.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  return { success: true, message: 'Employee created successfully' };
}

export async function updateEmployee(
  id: string,
  prevState: ActionState<UpdateEmployeeInput>,
  formData: FormData
): Promise<ActionState<UpdateEmployeeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = updateEmployeeSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone'),
    employeeCode: formData.get('employeeCode')?.toString() || formData.get('guardCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    joinDate: formData.get('joinDate')?.toString() || undefined,
    leftDate: formData.get('leftDate')?.toString() || null,
    note: formData.get('note')?.toString() || null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Employee.',
      success: false,
    };
  }

  try {
    await updateEmployeeWithChangelog(id, validatedFields.data as Prisma.EmployeeUpdateInput, adminId!)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DUPLICATE_EMPLOYEE_CODE')) {
      const parts = error.message.split(':');
      const conflictId = parts[1];
      return {
        message: `This employee code is already in use by another active employee (ID: ${conflictId}).`,
        success: false,
      };
    }
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const meta = error.meta as PrismaUniqueConstraintMeta;
        const fields = meta?.driverAdapterError?.cause?.constraint?.fields;

        if (fields?.includes('phone')) {
          return {
            message: 'An employee with this phone number already exists.',
            success: false,
          };
        }
        return {
          message: 'An employee with these unique details already exists.',
          success: false,
        };
      }
    }
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to Update Employee.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  return { success: true, message: 'Employee updated successfully' };
}

export async function updateEmployeePassword(
  id: string,
  prevState: ActionState<UpdateEmployeePasswordInput>,
  formData: FormData
): Promise<ActionState<UpdateEmployeePasswordInput>> {
  const validatedFields = updateEmployeePasswordSchema.safeParse({
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

    await updateEmployeePasswordWithChangelog(id, hashedPassword, adminId!)
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update password.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  return { success: true, message: 'Password updated successfully' };
}

export async function deleteEmployee(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    await deleteEmployeeWithChangelog(id, adminId!)
    revalidatePath('/admin/employees');
    return { success: true };
  } catch (error) {
    console.error('Database Error:', error);
    return { success: false, message: 'Failed to delete employee' };
  }
}

export async function bulkCreateEmployees(
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
  const employeesToCreate: Prisma.EmployeeCreateManyInput[] = [];
  const phonesToCheck: string[] = [];
  const idsToCheck: string[] = [];
  const phoneToRow = new Map<string, number>();
  const idToRow = new Map<string, number>();
  const employeeCodeToRow = new Map<string, number>();

  // Skip header row
  const startRow = 1;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV split, handling basic quotes stripping
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

    // Expected: Name, Phone, ID (Employee ID), Employee Code, Note, Join Date, Password
    // At minimum, Name, Phone, ID, Password, and Join Date are required.
    if (cols.length < 4) {
      errors.push(`Row ${i + 1}: Insufficient columns. Name, Phone, Employee ID, Password, and Join Date are required.`);
      continue;
    }

    const [name, phoneRaw, id, employeeCode, note, joinDateStr, password] = cols;
    let phone = phoneRaw;

    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    if (!name || !phone || !id) {
      errors.push(`Row ${i + 1}: Name, Phone, and Employee ID are required.`);
      continue;
    }

    // Validate ID length and alphanumeric (using same rules as schema for consistency)
    if (id.length !== 6) {
      errors.push(`Row ${i + 1}: Employee ID must be exactly 6 characters.`);
      continue;
    }
    if (!/^[a-zA-Z0-9]*$/.test(id)) {
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

    // Validate employee code if provided
    let employeeCodeValue: string | undefined = undefined;
    if (employeeCode) {
      if (!/^[a-zA-Z0-9]*$/.test(employeeCode)) {
        errors.push(`Row ${i + 1}: Employee code must be alphanumeric only.`);
        continue;
      }
      if (employeeCode.length > 12) {
        errors.push(`Row ${i + 1}: Employee code must be at most 12 characters.`);
        continue;
      }
      employeeCodeValue = employeeCode;
    }

    const inputData = {
      name,
      phone,
      id,
      employeeCode: employeeCodeValue,
      note: note || undefined,
      joinDate: joinDateISO,
      password: password,
    };

    // Use schema for validation
    const validationResult = createEmployeeSchema.safeParse(inputData);

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
      errors.push(`Row ${i + 1}: Duplicate Employee ID '${id}' in file.`);
      continue;
    }

    if (employeeCodeValue) {
      if (employeeCodeToRow.has(employeeCodeValue)) {
        errors.push(`Row ${i + 1}: Duplicate employee code '${employeeCodeValue}' in file.`);
        continue;
      }
      employeeCodeToRow.set(employeeCodeValue, i + 1);
    }

    phonesToCheck.push(phone);
    idsToCheck.push(id);
    phoneToRow.set(phone, i + 1);
    idToRow.set(id, i + 1);

    // Hash the password for this specific employee
    const hashedPasswordForEmployee = await hashPassword(validationResult.data.password);

    employeesToCreate.push({
      name: validationResult.data.name,
      phone: validationResult.data.phone,
      id: validationResult.data.id,
      employeeCode: validationResult.data.employeeCode || null,
      note: validationResult.data.note || null,
      joinDate: validationResult.data.joinDate as unknown as Date,
      hashedPassword: hashedPasswordForEmployee,
      status: true,
      lastUpdatedById: adminId || null,
    });
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed.', errors };
  }

  if (employeesToCreate.length === 0) {
    return { success: false, message: 'No valid employees found to create.' };
  }

  try {
    // Check for existing phones or IDs in DB
    const existingEmployees = await findExistingEmployees(phonesToCheck, idsToCheck);

    if (existingEmployees.length > 0) {
      const existingErrors: string[] = [];
      existingEmployees.forEach(g => {
        if (phonesToCheck.includes(g.phone)) {
          const row = phoneToRow.get(g.phone);
          existingErrors.push(`Row ${row}: Phone '${g.phone}' is already registered.`);
        }
        if (idsToCheck.includes(g.id)) {
          const row = idToRow.get(g.id);
          existingErrors.push(`Row ${row}: Employee ID '${g.id}' is already registered.`);
        }
      });
      return {
        success: false,
        message: 'Some unique identifiers already exist in the database.',
        errors: existingErrors,
      };
    }

    const finalData = employeesToCreate.map(g => ({
      ...g,
      joinDate: g.joinDate ? new Date(g.joinDate) : undefined,
    }));

    await bulkCreateEmployeesWithChangelog(finalData, adminId!)

    revalidatePath('/admin/employees');
    return { success: true, message: `Successfully created ${employeesToCreate.length} employees.` };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'DUPLICATE_EMPLOYEE_CODE_IN_BATCH') {
        return { success: false, message: 'Duplicate employee codes found within the uploaded file for active employees.' };
      }
      if (error.message.startsWith('DUPLICATE_EMPLOYEE_CODE:')) {
        const parts = error.message.split(':');
        const code = parts[1];
        const conflictId = parts[2];
        const row = employeeCodeToRow.get(code);
        const rowPrefix = row ? `Row ${row}: ` : '';
        return { success: false, message: `${rowPrefix}Employee code '${code}' is already in use by another active employee (ID: ${conflictId}).` };
      }
    }
    console.error('Bulk Create Error:', error);
    return { success: false, message: 'Database error during bulk creation.' };
  }
}

// --- Backward Compatibility Aliases ---
/** @deprecated Use getAllEmployeesForExport */
export const getAllGuardsForExport = getAllEmployeesForExport;
/** @deprecated Use createEmployee */
export const createGuard = createEmployee;
/** @deprecated Use updateEmployee */
export const updateGuard = updateEmployee;
/** @deprecated Use updateEmployeePassword */
export const updateGuardPassword = updateEmployeePassword;
/** @deprecated Use deleteEmployee */
export const deleteGuard = deleteEmployee;
/** @deprecated Use bulkCreateEmployees */
export const bulkCreateGuards = bulkCreateEmployees;