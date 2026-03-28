import {
  updateDefaultOfficeWorkSchedule,
} from '../app/admin/(authenticated)/settings/actions';
import {
  createOfficeWorkScheduleAction,
} from '../app/admin/(authenticated)/office-work-schedules/actions';
import {
  scheduleEmployeeOfficeWorkSchedule,
} from '../app/admin/(authenticated)/employees/actions';
import { checkSuperAdmin, requirePermission } from '@/lib/admin-auth';
import {
  createOfficeWorkSchedule,
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
  getDefaultOfficeWorkSchedule: jest.fn(),
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
    });
  });
});
