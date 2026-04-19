import {
  getActiveEmployeesSummary,
  getLastEmployeeSyncDuplicateWarning,
  getPaginatedEmployees,
  syncEmployeesFromExternal,
} from './employees';
import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { updateSystemSettingWithChangelog } from './settings';
import { cancelInProgressShiftsForDeactivatedEmployee, deleteFutureShiftsByEmployee } from './shifts';

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
      updateMany: jest.fn(),
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
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
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
    (prisma.employee.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.employeeSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.alert.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.changelog.create as jest.Mock).mockResolvedValue({});
    (redis.del as jest.Mock).mockResolvedValue(1);
    (redis.get as jest.Mock).mockResolvedValue(null);
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

  test('skips office schedule lookups when active office schedule names are disabled', async () => {
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

    const result = await getPaginatedEmployees({
      where: {},
      orderBy: { fullName: 'asc' },
      skip: 0,
      take: 10,
      includeActiveOfficeWorkScheduleName: false,
    });

    expect(result.employees[0]).toMatchObject({
      fullName: 'Office User',
      activeOfficeWorkScheduleName: null,
    });
    expect(prisma.officeWorkSchedule.findUnique).not.toHaveBeenCalled();
    expect(prisma.employeeOfficeWorkScheduleAssignment.findFirst).not.toHaveBeenCalled();
  });

  test('returns active employee summary for office employees without mode filtering', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'employee-1',
        fullName: 'Office User',
        employeeNumber: 'EMP001',
      },
    ]);

    const result = await getActiveEmployeesSummary('office');

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: {
        status: true,
        deletedAt: null,
        role: 'office',
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
      },
    });
    expect(result).toEqual([
      {
        id: 'employee-1',
        fullName: 'Office User',
        employeeNumber: 'EMP001',
      },
    ]);
  });

  test('returns active employee summary for non-office employees', async () => {
    (prisma.employee.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'employee-2',
        fullName: 'Guard User',
        employeeNumber: 'EMP002',
      },
    ]);

    await getActiveEmployeesSummary('on_site');

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: {
        status: true,
        deletedAt: null,
        role: 'on_site',
      },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        employeeNumber: true,
      },
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
    expect(redis.del).toHaveBeenCalledWith('employee:sync:last_duplicate_warning');
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

  test('sync keeps existing-id duplicate employee number winner and deactivates duplicate losers', async () => {
    (prisma.employee.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'employee-2',
          employeeNumber: 'EMP001',
          fullName: 'Employee Existing',
          personnelId: 'P2',
          nickname: 'Existing',
          jobTitle: 'Analyst',
          department: 'Operations',
          phone: '+62002',
          role: 'office',
          officeId: 'office-1',
          fieldModeEnabled: false,
          status: true,
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'employee-1',
          employeeNumber: 'EMP001',
          fullName: 'Employee Duplicate',
          personnelId: 'P1',
          nickname: 'Duplicate',
          jobTitle: 'Analyst',
          department: 'Operations',
          role: 'office',
          phone: '+62001',
        },
      ]);
    (prisma.employee.update as jest.Mock).mockResolvedValue({
      id: 'employee-2',
      employeeNumber: 'EMP001',
      fullName: 'Employee Existing Updated',
      personnelId: 'P2',
      nickname: 'Existing',
      jobTitle: 'Analyst',
      department: 'Operations',
      phone: '+62022',
      role: 'office',
      officeId: 'office-1',
      fieldModeEnabled: false,
      status: true,
    });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await syncEmployeesFromExternal(
      { type: 'system' },
      [
        {
          id: 'employee-1',
          employee_number: 'EMP001',
          personnel_id: 'P1',
          nickname: 'Duplicate',
          full_name: 'Employee Duplicate',
          job_title: 'Analyst',
          department: 'Operations',
          office_id: 'office-1',
          office_name: 'HQ',
          phone: '+62001',
        },
        {
          id: 'employee-2',
          employee_number: 'EMP001',
          personnel_id: 'P2',
          nickname: 'Existing',
          full_name: 'Employee Existing Updated',
          job_title: 'Analyst',
          department: 'Operations',
          office_id: 'office-1',
          office_name: 'HQ',
          phone: '+62022',
        },
      ]
    );

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-2' },
      })
    );
    expect(prisma.employee.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-1' },
      })
    );
    expect(prisma.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['employee-1'] } },
        data: expect.objectContaining({
          status: false,
          deletedAt: expect.any(Date),
        }),
      })
    );
    expect(deleteFutureShiftsByEmployee).toHaveBeenCalledWith('employee-1', prisma);
    expect(cancelInProgressShiftsForDeactivatedEmployee).toHaveBeenCalledWith('employee-1', prisma);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate employee_number "EMP001" detected'));
    expect(redis.set).toHaveBeenCalledWith(
      'employee:sync:last_duplicate_warning',
      expect.stringContaining('"employeeNumber":"EMP001"')
    );
    consoleWarnSpy.mockRestore();
  });

  test('sync keeps lexicographically smallest id for duplicate employee numbers when no id exists locally', async () => {
    (prisma.employee.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'employee-b',
          employeeNumber: 'EMP001',
          fullName: 'Employee B',
          personnelId: 'P2',
          nickname: 'B',
          jobTitle: 'Guard',
          department: 'Security',
          role: 'on_site',
          phone: '+62002',
        },
      ]);
    (prisma.employee.create as jest.Mock).mockResolvedValue({
      id: 'employee-a',
      employeeNumber: 'EMP001',
      fullName: 'Employee A',
      personnelId: 'P1',
      nickname: 'A',
      jobTitle: 'Guard',
      department: 'Security',
      role: 'on_site',
      phone: '+62001',
      fieldModeEnabled: false,
      status: true,
      mustChangePassword: true,
    });
    (prisma.employeePasswordHistory.create as jest.Mock).mockResolvedValue({});
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await syncEmployeesFromExternal(
      { type: 'system' },
      [
        {
          id: 'employee-b',
          employee_number: 'EMP001',
          personnel_id: 'P2',
          nickname: 'B',
          full_name: 'Employee B',
          job_title: 'Guard',
          department: 'Security',
          office_id: null,
          office_name: null,
          phone: '+62002',
        },
        {
          id: 'employee-a',
          employee_number: 'EMP001',
          personnel_id: 'P1',
          nickname: 'A',
          full_name: 'Employee A',
          job_title: 'Guard',
          department: 'Security',
          office_id: null,
          office_name: null,
          phone: '+62001',
        },
      ]
    );

    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'employee-a',
          employeeNumber: 'EMP001',
        }),
      })
    );
    expect(prisma.employee.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['employee-b'] } },
        data: expect.objectContaining({
          status: false,
          deletedAt: expect.any(Date),
        }),
      })
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate employee_number "EMP001" detected'));
    consoleWarnSpy.mockRestore();
  });

  test('returns last duplicate warning from redis when payload is valid', async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        detectedAt: '2026-04-19T00:00:00.000Z',
        duplicateCount: 1,
        entries: [{ employeeNumber: 'EMP001', winnerId: 'employee-2', loserIds: ['employee-1'] }],
      })
    );

    const result = await getLastEmployeeSyncDuplicateWarning();

    expect(redis.get).toHaveBeenCalledWith('employee:sync:last_duplicate_warning');
    expect(result).toEqual({
      detectedAt: '2026-04-19T00:00:00.000Z',
      duplicateCount: 1,
      entries: [{ employeeNumber: 'EMP001', winnerId: 'employee-2', loserIds: ['employee-1'] }],
    });
  });
});
