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
import { Prisma } from '@prisma/client';
import { EmployeeWithRelations } from '@repo/database';
import { parse, isValid } from 'date-fns';
import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { ActionState } from '@/types/actions';
import { getAllDepartments } from '@/lib/data-access/departments';
import { getAllDesignations } from '@/lib/data-access/designations';
import { getAllOffices } from '@/lib/data-access/offices';

export async function getAllEmployeesForExport(): Promise<
  Serialized<EmployeeWithRelations>[]
> {
  const employees = await getAllEmployees(undefined, true);
  return serialize(employees);
}

export async function getDepartmentsAndDesignations() {
  const [departments, designations, offices] = await Promise.all([
    getAllDepartments(),
    getAllDesignations(),
    getAllOffices(),
  ]);
  return { 
    departments: serialize(departments), 
    designations: serialize(designations),
    offices: serialize(offices)
  };
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
    title: formData.get('title')?.toString() || undefined,
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone'),
    id: formData.get('id')?.toString() || undefined,
    employeeCode: formData.get('employeeCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    departmentId: formData.get('departmentId')?.toString() || undefined,
    designationId: formData.get('designationId')?.toString() || undefined,
    officeId: formData.get('officeId')?.toString() || undefined,
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

  const { password, departmentId, designationId, officeId, ...restData } = validatedFields.data;

  try {
    // Hash the password if provided
    const dataToCreate: Prisma.EmployeeCreateInput = {
      ...restData,
      hashedPassword: await hashPassword(password!),
      ...(departmentId && { department: { connect: { id: departmentId } } }),
      ...(designationId && { designation: { connect: { id: designationId } } }),
      ...(officeId && { office: { connect: { id: officeId } } }),
    };

    await createEmployeeWithChangelog(dataToCreate, adminId!);
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
  revalidatePath('/admin/shifts', 'layout');
  revalidatePath('/admin/attendance');
  revalidatePath('/admin/checkins');
  return { success: true, message: 'Employee created successfully' };
}

export async function updateEmployee(
  id: string,
  prevState: ActionState<UpdateEmployeeInput>,
  formData: FormData
): Promise<ActionState<UpdateEmployeeInput>> {
  const adminId = await getAdminIdFromToken();
  const validatedFields = updateEmployeeSchema.safeParse({
    title: formData.get('title')?.toString() || undefined,
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone'),
    employeeCode: formData.get('employeeCode')?.toString() || undefined,
    status: formData.get('status') === 'true' ? true : formData.get('status') === 'false' ? false : undefined,
    departmentId: formData.get('departmentId')?.toString() || undefined,
    designationId: formData.get('designationId')?.toString() || undefined,
    officeId: formData.get('officeId')?.toString() || undefined,
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

  const { departmentId, designationId, officeId, ...restData } = validatedFields.data;

  try {
    const dataToUpdate: Prisma.EmployeeUpdateInput = {
      ...restData,
      department: departmentId ? { connect: { id: departmentId } } : { disconnect: true },
      designation: designationId ? { connect: { id: designationId } } : { disconnect: true },
      office: officeId ? { connect: { id: officeId } } : { disconnect: true },
    };

    await updateEmployeeWithChangelog(id, dataToUpdate, adminId!);
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
  revalidatePath('/admin/shifts', 'layout');
  revalidatePath('/admin/attendance');
  revalidatePath('/admin/checkins');
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

    await updateEmployeePasswordWithChangelog(id, hashedPassword, adminId!);
  } catch (error) {
    console.error('Database Error:', error);
    return {
      message: 'Database Error: Failed to update password.',
      success: false,
    };
  }

  revalidatePath('/admin/employees');
  revalidatePath('/admin/shifts', 'layout');
  revalidatePath('/admin/attendance');
  revalidatePath('/admin/checkins');
  return { success: true, message: 'Password updated successfully' };
}

export async function deleteEmployee(id: string) {
  try {
    const adminId = await getAdminIdFromToken();
    await deleteEmployeeWithChangelog(id, adminId!);
    revalidatePath('/admin/employees');
    revalidatePath('/admin/shifts', 'layout');
    revalidatePath('/admin/attendance');
    revalidatePath('/admin/checkins');
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

  const [allDepts, allDesigs, allOffices] = await Promise.all([
    getAllDepartments(),
    getAllDesignations(),
    getAllOffices(),
  ]);

  const deptMap = new Map(allDepts.map(d => [d.name.toLowerCase(), d.id]));
  const officeMap = new Map(allOffices.map(o => [o.name.toLowerCase(), o.id]));
  const desigMap = new Map(allDesigs.map(d => [d.name.toLowerCase(), d.id]));

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

    // Expected: Title, First Name, Last Name, Phone, ID (Employee ID), Employee Code, Note, Join Date, Password, Department, Designation, Office
    if (cols.length < 9) {
      errors.push(
        `Row ${i + 1}: Insufficient columns. Expected at least 9 columns (Title, First Name, Last Name, Phone, Employee ID, Employee Code, Note, Join Date, Password).`
      );
      continue;
    }

    const [
      title,
      firstName,
      lastName,
      phoneRaw,
      id,
      employeeCode,
      note,
      joinDateStr,
      password,
      deptName,
      desigName,
      officeName,
    ] = cols;
    let phone = phoneRaw;

    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    if (!title || !firstName || !phone || !id) {
      errors.push(`Row ${i + 1}: Title, First Name, Phone, and Employee ID are required.`);
      continue;
    }

    // Resolve Department
    let departmentId: string | undefined = undefined;
    if (deptName) {
      departmentId = deptMap.get(deptName.toLowerCase());
      if (!departmentId) {
        errors.push(`Row ${i + 1}: Department '${deptName}' not found.`);
        continue;
      }
    }

    // Resolve Designation
    let designationId: string | undefined = undefined;
    if (desigName) {
      designationId = desigMap.get(desigName.toLowerCase());
      if (!designationId) {
        errors.push(`Row ${i + 1}: Designation '${desigName}' not found.`);
        continue;
      }
    }

    // Resolve Office
    let officeId: string | undefined = undefined;
    if (officeName) {
      officeId = officeMap.get(officeName.toLowerCase());
      if (!officeId) {
        errors.push(`Row ${i + 1}: Office '${officeName}' not found.`);
        continue;
      }
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
      title,
      firstName,
      lastName: lastName || undefined,
      phone,
      id,
      employeeCode: employeeCodeValue,
      note: note || undefined,
      joinDate: joinDateISO,
      password: password,
      departmentId,
      designationId,
      officeId,
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
      title: validationResult.data.title,
      firstName: validationResult.data.firstName,
      lastName: validationResult.data.lastName || null,
      phone: validationResult.data.phone,
      id: validationResult.data.id,
      employeeCode: validationResult.data.employeeCode || null,
      note: validationResult.data.note || null,
      joinDate: validationResult.data.joinDate as unknown as Date,
      hashedPassword: hashedPasswordForEmployee,
      departmentId: validationResult.data.departmentId || null,
      designationId: validationResult.data.designationId || null,
      officeId: validationResult.data.officeId || null,
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

    await bulkCreateEmployeesWithChangelog(finalData, adminId!);

    revalidatePath('/admin/employees');
    revalidatePath('/admin/shifts', 'layout');
    revalidatePath('/admin/attendance');
    revalidatePath('/admin/checkins');
    return { success: true, message: `Successfully created ${employeesToCreate.length} employees.` };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'DUPLICATE_EMPLOYEE_CODE_IN_BATCH') {
        return {
          success: false,
          message: 'Duplicate employee codes found within the uploaded file for active employees.',
        };
      }
      if (error.message.startsWith('DUPLICATE_EMPLOYEE_CODE:')) {
        const parts = error.message.split(':');
        const code = parts[1];
        const conflictId = parts[2];
        const row = employeeCodeToRow.get(code);
        const rowPrefix = row ? `Row ${row}: ` : '';
        return {
          success: false,
          message: `${rowPrefix}Employee code '${code}' is already in use by another active employee (ID: ${conflictId}).`,
        };
      }
    }
    console.error('Bulk Create Error:', error);
    return { success: false, message: 'Database error during bulk creation.' };
  }
}
