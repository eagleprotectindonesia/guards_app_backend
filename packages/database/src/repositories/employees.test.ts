import { getPaginatedEmployees } from './employees';
import { db as prisma } from '../prisma/client';

jest.mock('../prisma/client', () => ({
  db: {
    employee: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    systemSetting: {
      findUnique: jest.fn(),
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

describe('employees repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns active office work schedule from current assignment for office employees', async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      [
        {
          id: 'employee-1',
          fullName: 'Office User',
          employeeNumber: 'EMP001',
          department: 'Finance',
          jobTitle: 'Analyst',
          role: 'office',
          office: { name: 'HQ' },
        },
      ],
      1,
    ]);
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({ value: 'default-schedule' });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'default-schedule',
      code: 'default-office-work-schedule',
      name: 'Default Office Schedule',
      days: [],
    });
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
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      [
        {
          id: 'employee-1',
          fullName: 'Office User',
          employeeNumber: 'EMP001',
          department: 'Finance',
          jobTitle: 'Analyst',
          role: 'office',
          office: { name: 'HQ' },
        },
      ],
      1,
    ]);
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({ value: 'default-schedule' });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'default-schedule',
      code: 'default-office-work-schedule',
      name: 'Default Office Schedule',
      days: [],
    });
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
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      [
        {
          id: 'employee-1',
          fullName: 'Guard User',
          employeeNumber: 'EMP002',
          department: 'Security',
          jobTitle: 'Guard',
          role: 'on_site',
          office: { name: 'HQ' },
        },
      ],
      1,
    ]);
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({ value: 'default-schedule' });
    (prisma.officeWorkSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'default-schedule',
      code: 'default-office-work-schedule',
      name: 'Default Office Schedule',
      days: [],
    });

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
});
