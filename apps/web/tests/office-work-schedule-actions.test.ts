import {
  updateDefaultOfficeWorkSchedule,
} from '../app/admin/(authenticated)/settings/actions';
import {
  createOfficeWorkScheduleAction,
} from '../app/admin/(authenticated)/office-work-schedules/actions';
import {
  scheduleEmployeeOfficeWorkSchedule,
  bulkScheduleEmployeeOfficeWorkSchedules,
} from '../app/admin/(authenticated)/employees/actions';
import { checkSuperAdmin, getAdminIdFromToken, requirePermission } from '@/lib/admin-auth';
import {
  bulkUpsertFutureOfficeWorkScheduleAssignments,
  createOfficeWorkSchedule,
  getActiveEmployees,
  getAllOfficeWorkSchedules,
  getDefaultOfficeWorkSchedule,
  scheduleFutureOfficeWorkScheduleAssignment,
  updateOfficeWorkSchedule,
} from '@repo/database';

jest.mock('@/lib/admin-auth', () => ({
  checkSuperAdmin: jest.fn(),
  requirePermission: jest.fn(),
  getAdminIdFromToken: jest.fn(),
}));

jest.mock('@repo/database', () => ({
  createOfficeWorkSchedule: jest.fn(),
  bulkUpsertFutureOfficeWorkScheduleAssignments: jest.fn(),
  getDefaultOfficeWorkSchedule: jest.fn(),
  getActiveEmployees: jest.fn(),
  getAllOfficeWorkSchedules: jest.fn(),
  scheduleFutureOfficeWorkScheduleAssignment: jest.fn(),
  updateOfficeWorkSchedule: jest.fn(),
  updateEmployee: jest.fn(),
  getAllEmployees: jest.fn(),
  EmployeePasswordPolicyError: class EmployeePasswordPolicyError extends Error {},
  setEmployeePassword: jest.fn(),
  getEmployeeSearchWhere: jest.fn(),
  hashPassword: jest.fn(),
  EMPLOYEE_SYNC_JOB_NAME: 'employee-sync',
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/queues', () => ({
  employeeSyncQueue: { add: jest.fn() },
}));

describe('office work schedule actions', () => {
  const fullWeekdays = [
    { weekday: 0, isWorkingDay: false, startTime: null, endTime: null },
    { weekday: 1, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
    { weekday: 2, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
    { weekday: 3, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
    { weekday: 4, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
    { weekday: 5, isWorkingDay: true, startTime: '08:00', endTime: '17:00' },
    { weekday: 6, isWorkingDay: false, startTime: null, endTime: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (checkSuperAdmin as jest.Mock).mockResolvedValue({ id: 'admin-1' });
    (requirePermission as jest.Mock).mockResolvedValue({ id: 'admin-1' });
    (getAdminIdFromToken as jest.Mock).mockResolvedValue('admin-1');
  });

  test('updates the default office work schedule from structured weekday data', async () => {
    (getDefaultOfficeWorkSchedule as jest.Mock).mockResolvedValue({
      id: 'default-schedule',
      name: 'Default Office Schedule',
    });

    const formData = new FormData();
    formData.append('days', JSON.stringify(fullWeekdays));

    const result = await updateDefaultOfficeWorkSchedule({ success: false }, formData);

    expect(result.success).toBe(true);
    expect(updateOfficeWorkSchedule).toHaveBeenCalledWith({
      id: 'default-schedule',
      name: 'Default Office Schedule',
      days: fullWeekdays,
    });
  });

  test('creates an office work schedule from the admin template form', async () => {
    const formData = new FormData();
    formData.append('name', 'Finance Team');
    formData.append('days', JSON.stringify(fullWeekdays));

    const result = await createOfficeWorkScheduleAction({ success: false }, formData);

    expect(result.success).toBe(true);
    expect(createOfficeWorkSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Finance Team',
        days: fullWeekdays,
      })
    );
  });

  test('schedules a future employee office work schedule change', async () => {
    const formData = new FormData();
    formData.append('officeWorkScheduleId', '550e8400-e29b-41d4-a716-446655440000');
    formData.append('effectiveFrom', '2026-03-30');

    const result = await scheduleEmployeeOfficeWorkSchedule('employee-1', { success: false }, formData);

    expect(result.success).toBe(true);
    expect(scheduleFutureOfficeWorkScheduleAssignment).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      officeWorkScheduleId: '550e8400-e29b-41d4-a716-446655440000',
      effectiveFrom: new Date('2026-03-29T16:00:00.000Z'),
      actor: { type: 'admin', id: 'admin-1' },
      source: 'single_update',
    });
  });

  test('imports bulk office work schedule assignments from csv', async () => {
    (getActiveEmployees as jest.Mock).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP001',
        role: 'office',
      },
    ]);
    (getAllOfficeWorkSchedules as jest.Mock).mockResolvedValue([
      {
        id: 'schedule-1',
        name: 'Finance Team',
      },
    ]);

    const formData = new FormData();
    formData.append(
      'file',
      new File(['employee_number,schedule_name,effective_from\nEMP001,Finance Team,2026-03-30\n'], 'office-schedules.csv', {
        type: 'text/csv',
      })
    );

    const result = await bulkScheduleEmployeeOfficeWorkSchedules(formData);

    expect(result.success).toBe(true);
    expect(bulkUpsertFutureOfficeWorkScheduleAssignments).toHaveBeenCalledWith([
      {
        employeeId: 'employee-1',
        officeWorkScheduleId: 'schedule-1',
        effectiveFrom: new Date('2026-03-29T16:00:00.000Z'),
      },
    ], {
      actor: { type: 'admin', id: 'admin-1' },
      source: 'bulk_import',
    });
  });

  test('rejects bulk office work schedule csv with multiple future dates for one employee', async () => {
    (getActiveEmployees as jest.Mock).mockResolvedValue([
      {
        id: 'employee-1',
        employeeNumber: 'EMP001',
        role: 'office',
      },
    ]);
    (getAllOfficeWorkSchedules as jest.Mock).mockResolvedValue([
      {
        id: 'schedule-1',
        name: 'Finance Team',
      },
    ]);

    const formData = new FormData();
    formData.append(
      'file',
      new File(
        [
          'employee_number,schedule_name,effective_from\n',
          'EMP001,Finance Team,2026-03-30\n',
          'EMP001,Finance Team,2026-04-06\n',
        ],
        'office-schedules.csv',
        { type: 'text/csv' }
      )
    );

    const result = await bulkScheduleEmployeeOfficeWorkSchedules(formData);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Validation failed.');
    expect(result.errors).toContain(
      "Row 3: Multiple effective_from dates for employee_number 'EMP001' are not allowed in one import."
    );
    expect(bulkUpsertFutureOfficeWorkScheduleAssignments).not.toHaveBeenCalled();
  });
});
