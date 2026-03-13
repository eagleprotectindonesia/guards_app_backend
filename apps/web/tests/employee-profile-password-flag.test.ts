import { GET } from '@/app/api/employee/my/profile/route';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';

jest.mock('@/lib/employee-auth', () => ({
  getAuthenticatedEmployee: jest.fn(),
}));

describe('GET /api/employee/my/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns mustChangePassword from the employee record', async () => {
    (getAuthenticatedEmployee as jest.Mock).mockResolvedValue({
      id: 'emp-1',
      fullName: 'Guard One',
      phone: '123',
      employeeNumber: '001',
      mustChangePassword: true,
      department: 'Security',
      jobTitle: 'Guard',
      role: 'on_site',
    });

    const response = await GET();
    const data = await response.json();

    expect(data.employee.mustChangePassword).toBe(true);
    expect(data.guard.mustChangePassword).toBe(true);
  });
});
