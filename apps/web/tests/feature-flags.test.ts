import { isOfficeWorkSchedulesEnabled } from '../lib/feature-flags';
import { getAdminNavItems } from '../lib/admin-navigation';

describe('office work schedule feature flag', () => {
  const originalEnv = process.env.ENABLE_OFFICE_WORK_SCHEDULES;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_OFFICE_WORK_SCHEDULES;
    } else {
      process.env.ENABLE_OFFICE_WORK_SCHEDULES = originalEnv;
    }
  });

  test('defaults to disabled when env is unset', () => {
    delete process.env.ENABLE_OFFICE_WORK_SCHEDULES;

    expect(isOfficeWorkSchedulesEnabled()).toBe(false);
  });

  test('disables office work schedules when env is false', () => {
    process.env.ENABLE_OFFICE_WORK_SCHEDULES = 'false';

    expect(isOfficeWorkSchedulesEnabled()).toBe(false);
  });

  test('removes office schedules from admin nav when disabled', () => {
    expect(getAdminNavItems(false).some(item => item.href === '/admin/office-work-schedules')).toBe(false);
    expect(getAdminNavItems(false).some(item => item.href === '/admin/office-shifts')).toBe(true);
    expect(getAdminNavItems(false).some(item => item.href === '/admin/office-shift-types')).toBe(true);
  });

  test('includes office schedules in admin nav when enabled', () => {
    expect(getAdminNavItems(true).some(item => item.href === '/admin/office-work-schedules')).toBe(true);
  });

  test('includes leave requests in admin nav', () => {
    expect(getAdminNavItems(false).some(item => item.href === '/admin/leave-requests')).toBe(true);
    expect(getAdminNavItems(true).some(item => item.href === '/admin/leave-requests')).toBe(true);
  });
});
