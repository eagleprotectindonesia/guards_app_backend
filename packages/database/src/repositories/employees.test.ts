import { getPaginatedEmployees, syncEmployeesFromExternal } from './employees';
import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { updateSystemSettingWithChangelog } from './settings';

jest.mock('../prisma/client', () => ({
  db: {
    office: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employeePasswordHistory: {
      create: jest.fn(),
    },
    employeeSession: {
      updateMany: jest.fn(),
    },
    alert: {
      updateMany: jest.fn(),
    },
    changelog: {
      create: jest.fn(),
    },
    systemSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    officeWorkSchedule: {
      findUnique: jest.fn(),
    },
    employeeOfficeWorkScheduleAssignment: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../redis/client', () => ({
  redis: {
    set: jest.fn(),
    xadd: jest.fn(),
  },
}));

jest.mock('./settings', () => ({
  getSystemSetting: jest.fn(async (name: string) => {
    if (name === 'DEFAULT_OFFICE_WORK_SCHEDULE_ID') {
      return { value: 'default-schedule' };
    }

    if (name === 'OFFICE_JOB_TITLE_CATEGORY_MAP') {
      return { value: '{"staff":["Analyst"],"management":["Branch Manager"]}' };
    }

    return null;
  }),
  updateSystemSettingWithChangelog: jest.fn(),
}));

jest.mock('./shifts', () => ({
  deleteFutureShiftsByEmployee: jest.fn(),
  cancelInProgressShiftsForDeactivatedEmployee: jest.fn(),
}));

describe('employees repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async input => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }
      return input(prisma);
    });
    (prisma.systemSetting.findUnique as jest.Mock).mockImplementation(({ where }: { where: { name: string } }) => {
      if (where.name === 'DEFAULT_OFFICE_WORK_SCHEDULE_ID') {
        return Promise.resolve({ value: 'default-schedule' });
      }

      if (where.name === 'OFFICE_JOB_TITLE_CATEGORY_MAP') {
        return Promise.resolve({
          value: '{"staff":["Analyst"],"management":["Branch Manager"]}',
        });
      }

      return Promise.resolve(null);
    });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'default-schedule',
      code: 'default-office-work-schedule',
      name: 'Default Office Schedule',
      days: [],
    });
    (prisma.office.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.office.create as jest.Mock).mockResolvedValue({});
    (prisma.office.update as jest.Mock).mockResolvedValue({});
  });

  test('returns active office work schedule from current assignment for office employees', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'employee-1',
        fullName: 'Office User',
        employeeNumber: 'EMP001',
        department: 'Finance',
        jobTitle: 'Analyst',
        role: 'office',
        officeId: 'office-1',
        fieldModeEnabled: false,
        office: { name: 'HQ' },
      },
    ]);
    (prisma.employee.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      officeWorkSchedule: { name: 'Finance Team' },
    });

    const result = await getPaginatedEmployees({
      where: {},
      orderBy: { fullName: 'asc' },
      skip: 0,
      take: 10,
    });

    expect(result.employees[0]).toMatchObject({
      fullName: 'Office User',
      activeOfficeWorkScheduleName: 'Finance Team',
    });
  });

  test('falls back to default office work schedule when office employee has no current assignment', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'employee-1',
        fullName: 'Office User',
        employeeNumber: 'EMP001',
        department: 'Finance',
        jobTitle: 'Analyst',
        role: 'office',
        officeId: 'office-1',
        fieldModeEnabled: false,
        office: { name: 'HQ' },
      },
    ]);
    (prisma.employee.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getPaginatedEmployees({
      where: {},
      orderBy: { fullName: 'asc' },
      skip: 0,
      take: 10,
    });

    expect(result.employees[0]).toMatchObject({
      activeOfficeWorkScheduleName: 'Default Office Schedule',
    });
  });

  test('returns null active office work schedule for non-office employees', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'employee-1',
        fullName: 'Guard User',
        employeeNumber: 'EMP002',
        department: 'Security',
        jobTitle: 'Guard',
        role: 'on_site',
        officeId: null,
        fieldModeEnabled: false,
        office: { name: 'HQ' },
      },
    ]);
    (prisma.employee.count as jest.Mock).mockResolvedValueOnce(1);

    const result = await getPaginatedEmployees({
      where: {},
      orderBy: { fullName: 'asc' },
      skip: 0,
      take: 10,
    });

    expect(result.employees[0]).toMatchObject({
      fullName: 'Guard User',
      activeOfficeWorkScheduleName: null,
    });
    expect(prisma.employeeOfficeWorkScheduleAssignment.findFirst).not.toHaveBeenCalled();
  });

  test('adds derived office category and forced field mode metadata', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'employee-1',
        fullName: 'Office User',
        employeeNumber: 'EMP001',
        department: 'Finance',
        jobTitle: 'Analyst',
        role: 'office',
        officeId: 'office-1',
        fieldModeEnabled: true,
        office: { name: 'HQ' },
      },
    ]);
    (prisma.employee.count as jest.Mock).mockResolvedValueOnce(1);
    (prisma.employeeOfficeWorkScheduleAssignment.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getPaginatedEmployees({
      where: {},
      orderBy: { fullName: 'asc' },
      skip: 0,
      take: 10,
    });

    expect(result.employees[0]).toMatchObject({
      jobTitleCategory: 'staff',
      fieldModeEnabled: false,
      isFieldModeEditable: false,
      fieldModeReasonCode: 'staff_with_office',
    });
  });

  test('sync auto-seeds uncategorized office job titles into staff once per run', async () => {
    (prisma.employee.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.employee.create as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      employeeNumber: 'EMP001',
      fullName: 'Office User',
      personnelId: 'P1',
      nickname: 'Office',
      jobTitle: 'Operations Lead',
      department: 'Operations',
      phone: '+62123',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      status: true,
      mustChangePassword: true,
    });
    (prisma.employeePasswordHistory.create as jest.Mock).mockResolvedValue({});
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});

    await syncEmployeesFromExternal(
      { type: 'system' },
      [
        {
          id: 'employee-1',
          employee_number: 'EMP001',
          personnel_id: 'P1',
          nickname: 'Office',
          full_name: 'Office User',
          job_title: 'Operations Lead',
          department: 'Operations',
          office_id: 'office-1',
          office_name: 'HQ',
          phone: '+62123',
        },
      ]
    );

    expect(updateSystemSettingWithChangelog).toHaveBeenCalledWith(
      'OFFICE_JOB_TITLE_CATEGORY_MAP',
      '{"staff":["Analyst","Operations Lead"],"management":["Branch Manager"]}',
      { type: 'system' },
      expect.stringContaining('Auto-seeded')
    );
    expect(prisma.employee.create).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
  });

  test('sync ignores blank and on-site titles when auto-seeding', async () => {
    (prisma.employee.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.employee.create as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      employeeNumber: 'EMP001',
      fullName: 'Guard User',
      personnelId: 'P1',
      nickname: 'Guard',
      jobTitle: null,
      department: 'Security',
      phone: '+62123',
      role: 'on_site',
      officeId: null,
      fieldModeEnabled: false,
      status: true,
      mustChangePassword: true,
    });
    (prisma.employeePasswordHistory.create as jest.Mock).mockResolvedValue({});
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});

    await syncEmployeesFromExternal(
      { type: 'system' },
      [
        {
          id: 'employee-1',
          employee_number: 'EMP001',
          personnel_id: 'P1',
          nickname: 'Guard',
          full_name: 'Guard User',
          job_title: null,
          department: 'Security',
          office_id: null,
          office_name: null,
          phone: '+62123',
        },
      ]
    );

    expect(updateSystemSettingWithChangelog).not.toHaveBeenCalled();
  });

  test('sync changelog entries omit actorId for system-triggered runs', async () => {
    (prisma.employee.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'employee-1',
          employeeNumber: 'EMP001',
          fullName: 'Office User',
          personnelId: 'P1',
          nickname: 'Office',
          jobTitle: 'Analyst',
          department: 'Operations',
          phone: '+62123',
          role: 'office',
          officeId: 'office-1',
          fieldModeEnabled: false,
          status: true,
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([]);
    (prisma.employee.update as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      employeeNumber: 'EMP001',
      fullName: 'Office User Updated',
      personnelId: 'P1',
      nickname: 'Office',
      jobTitle: 'Analyst',
      department: 'Operations',
      phone: '+62123',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      status: true,
    });
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});

    await syncEmployeesFromExternal(
      { type: 'system' },
      [
        {
          id: 'employee-1',
          employee_number: 'EMP001',
          personnel_id: 'P1',
          nickname: 'Office',
          full_name: 'Office User Updated',
          job_title: 'Analyst',
          department: 'Operations',
          office_id: 'office-1',
          office_name: 'HQ',
          phone: '+62123',
        },
      ]
    );

    expect(prisma.changelog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor: 'system',
          actorId: null,
        }),
      })
    );
  });
});
