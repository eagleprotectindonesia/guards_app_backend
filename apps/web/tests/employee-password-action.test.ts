import { updateEmployeePassword } from '../app/admin/(authenticated)/employees/actions';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { setEmployeePassword, EmployeePasswordPolicyError } from '@/lib/data-access/employees';

jest.mock('@/lib/admin-auth', () => ({
  getAdminIdFromToken: jest.fn(),
}));

jest.mock('@/lib/data-access/employees', () => ({
  setEmployeePassword: jest.fn(),
  EmployeePasswordPolicyError: class EmployeePasswordPolicyError extends Error {},
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

describe('updateEmployeePassword action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAdminIdFromToken as jest.Mock).mockResolvedValue('admin-1');
  });

  test('sets a forced password change after an admin reset', async () => {
    const formData = new FormData();
    formData.append('password', 'Reset1234');
    formData.append('confirmPassword', 'Reset1234');

    const result = await updateEmployeePassword('emp-1', { success: false }, formData);

    expect(result.success).toBe(true);
    expect(setEmployeePassword).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      newPassword: 'Reset1234',
      actor: { type: 'admin', adminId: 'admin-1' },
      mustChangePassword: true,
    });
  });

  test('returns a validation-style error when the password is in recent history', async () => {
    const formData = new FormData();
    formData.append('password', 'Reset1234');
    formData.append('confirmPassword', 'Reset1234');
    (setEmployeePassword as jest.Mock).mockRejectedValue(
      new EmployeePasswordPolicyError('New password cannot match any of your last 3 passwords')
    );

    const result = await updateEmployeePassword('emp-1', { success: false }, formData);

    expect(result.success).toBe(false);
    expect(result.errors?.password).toEqual(['New password cannot match any of your last 3 passwords']);
  });
});
