import { updateEmployeePassword } from '../app/admin/(authenticated)/employees/actions';
import { getAdminIdFromToken } from '@/lib/admin-auth';
import { setEmployeePassword } from '@repo/database';

jest.mock('@/lib/admin-auth', () => ({
  getAdminIdFromToken: jest.fn(),
}));

jest.mock('@/lib/data-access/employees', () => ({
  setEmployeePassword: jest.fn(),
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
      enforceHistoryPolicy: false,
    });
  });

  test('returns schema validation errors for invalid admin reset input', async () => {
    const formData = new FormData();
    formData.append('password', 'short');
    formData.append('confirmPassword', 'different');

    const result = await updateEmployeePassword('emp-1', { success: false }, formData);

    expect(result.success).toBe(false);
    expect(setEmployeePassword).not.toHaveBeenCalled();
    expect(result.errors?.password).toEqual(['Password must be at least 8 characters long']);
    expect(result.errors?.confirmPassword).toEqual(["Passwords don't match"]);
  });
});
