import { getTestPrisma } from './database';
import { Prisma } from '@repo/database';
import bcrypt from 'bcryptjs';

type Admin = Prisma.AdminGetPayload<{}>;
type Employee = Prisma.EmployeeGetPayload<{}>;
type Site = Prisma.SiteGetPayload<{}>;
type Shift = Prisma.ShiftGetPayload<{ include: { site: true; shiftType: true; employee: true } }>;
type ShiftType = Prisma.ShiftTypeGetPayload<{}>;
type Department = Prisma.DepartmentGetPayload<{}>;
type Designation = Prisma.DesignationGetPayload<{}>;
type Office = Prisma.OfficeGetPayload<{}>;
type Role = Prisma.RoleGetPayload<{}>;

/**
 * Factory functions to create test data
 */

export async function createRole(data?: Partial<Role>): Promise<Role> {
  const prisma = getTestPrisma();
  
  return prisma.role.create({
    data: {
      name: data?.name || `Test Role ${Date.now()}`,
      description: data?.description || 'Test role',
      isSystem: data?.isSystem ?? false,
      ...data,
    },
  });
}

export async function createAdmin(data?: Partial<Admin>): Promise<Admin> {
  const prisma = getTestPrisma();
  
  const hashedPassword = await bcrypt.hash(data?.hashedPassword || 'password123', 10);
  
  return prisma.admin.create({
    data: {
      name: data?.name || 'Test Admin',
      email: data?.email || `admin-${Date.now()}@test.com`,
      hashedPassword,
      role: data?.role || 'admin',
      ...data,
    },
  });
}

export async function createDepartment(data?: Partial<Department>): Promise<Department> {
  const prisma = getTestPrisma();
  
  return prisma.department.create({
    data: {
      name: data?.name || `Test Department ${Date.now()}`,
      note: data?.note,
      ...data,
    },
  });
}

export async function createDesignation(
  departmentId: string,
  data?: Partial<Designation>
): Promise<Designation> {
  const prisma = getTestPrisma();
  
  return prisma.designation.create({
    data: {
      name: data?.name || `Test Designation ${Date.now()}`,
      role: data?.role || 'on_site',
      departmentId,
      note: data?.note,
      ...data,
    },
  });
}

export async function createOffice(data?: Partial<Office>): Promise<Office> {
  const prisma = getTestPrisma();
  
  return prisma.office.create({
    data: {
      name: data?.name || `Test Office ${Date.now()}`,
      address: data?.address || 'Test Address',
      latitude: data?.latitude ?? -6.2088,
      longitude: data?.longitude ?? 106.8456,
      status: data?.status ?? true,
      ...data,
    },
  });
}

export async function createEmployee(data?: Partial<Employee>): Promise<Employee> {
  const prisma = getTestPrisma();
  
  const hashedPassword = await bcrypt.hash(data?.hashedPassword || 'password123', 10);
  const employeeId = data?.id || `EMP${Date.now()}`;
  
  return prisma.employee.create({
    data: {
      id: employeeId,
      firstName: data?.firstName || 'Test',
      lastName: data?.lastName || 'Employee',
      phone: data?.phone || `+62${Date.now().toString().slice(-10)}`,
      hashedPassword,
      role: data?.role || 'on_site',
      status: data?.status ?? true,
      title: data?.title || 'Mr',
      ...data,
    },
  });
}

export async function createSite(data?: Partial<Site>): Promise<Site> {
  const prisma = getTestPrisma();
  
  return prisma.site.create({
    data: {
      name: data?.name || `Test Site ${Date.now()}`,
      clientName: data?.clientName || 'Test Client',
      address: data?.address || 'Test Address',
      latitude: data?.latitude ?? -6.2088,
      longitude: data?.longitude ?? 106.8456,
      status: data?.status ?? true,
      ...data,
    },
  });
}

export async function createShiftType(data?: Partial<ShiftType>): Promise<ShiftType> {
  const prisma = getTestPrisma();
  
  return prisma.shiftType.create({
    data: {
      name: data?.name || `Test Shift Type ${Date.now()}`,
      startTime: data?.startTime || '08:00',
      endTime: data?.endTime || '16:00',
      ...data,
    },
  });
}

export interface CreateShiftOptions {
  siteId: string;
  shiftTypeId: string;
  employeeId?: string;
  date?: Date;
  startsAt?: Date;
  endsAt?: Date;
  requiredCheckinIntervalMins?: number;
  graceMinutes?: number;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  lastHeartbeatAt?: Date;
}

export async function createShift(options: CreateShiftOptions): Promise<Shift> {
  const prisma = getTestPrisma();
  
  const now = new Date();
  const defaultStartsAt = new Date(now);
  defaultStartsAt.setHours(8, 0, 0, 0);
  
  const defaultEndsAt = new Date(defaultStartsAt);
  defaultEndsAt.setHours(16, 0, 0, 0);
  
  return prisma.shift.create({
    data: {
      siteId: options.siteId,
      shiftTypeId: options.shiftTypeId,
      employeeId: options.employeeId,
      date: options.date || now,
      startsAt: options.startsAt || defaultStartsAt,
      endsAt: options.endsAt || defaultEndsAt,
      status: options.status || 'scheduled',
      requiredCheckinIntervalMins: options.requiredCheckinIntervalMins ?? 60,
      graceMinutes: options.graceMinutes ?? 5,
      lastHeartbeatAt: options.lastHeartbeatAt,
    },
    include: {
      site: true,
      shiftType: true,
      employee: true,
    },
  });
}

/**
 * Create a complete test setup with all related entities
 */
export async function createCompleteTestSetup() {
  const department = await createDepartment({ name: 'Security' });
  const designation = await createDesignation(department.id, { 
    name: 'Security Guard',
    role: 'on_site' 
  });
  const employee = await createEmployee({ 
    departmentId: department.id,
    designationId: designation.id,
    role: 'on_site',
  });
  const site = await createSite();
  const shiftType = await createShiftType();
  const admin = await createAdmin();
  
  return {
    department,
    designation,
    employee,
    site,
    shiftType,
    admin,
  };
}
