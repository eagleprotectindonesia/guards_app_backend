import { getAuthenticatedEmployee } from '../lib/employee-auth';
import { cookies, headers } from 'next/headers';
import { verifySession } from '../lib/auth/session';
import { getEmployeeById } from '@/lib/data-access/employees';

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
  headers: jest.fn(),
}));

// Mock verifySession
jest.mock('../lib/auth/session', () => ({
  verifySession: jest.fn(),
}));

// Mock getEmployeeById
jest.mock('@/lib/data-access/employees', () => ({
  getEmployeeById: jest.fn(),
}));

describe('getAuthenticatedEmployee', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn(),
    });
    (headers as jest.Mock).mockResolvedValue(new Headers());
  });

  test('returns null if no cookie or header', async () => {
    const result = await getAuthenticatedEmployee();
    expect(result).toBeNull();
  });

  test('returns employee from valid cookie', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: 'valid-cookie' }),
    });
    (verifySession as jest.Mock).mockResolvedValue({ isValid: true, userId: 'emp-1' });
    (getEmployeeById as jest.Mock).mockResolvedValue({ id: 'emp-1', name: 'Test' });

    const result = await getAuthenticatedEmployee();
    expect(result).toEqual({ id: 'emp-1', name: 'Test' });
    expect(verifySession).toHaveBeenCalledWith('valid-cookie', 'employee');
  });

  test('returns employee from valid Bearer token in header', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('Authorization', 'Bearer valid-bearer');
    (headers as jest.Mock).mockResolvedValue(mockHeaders);
    (verifySession as jest.Mock).mockResolvedValue({ isValid: true, userId: 'emp-2' });
    (getEmployeeById as jest.Mock).mockResolvedValue({ id: 'emp-2', name: 'Bearer Test' });

    const result = await getAuthenticatedEmployee();
    
    // THIS IS EXPECTED TO FAIL UNTIL IMPLEMENTED
    expect(result).toEqual({ id: 'emp-2', name: 'Bearer Test' });
    expect(verifySession).toHaveBeenCalledWith('valid-bearer', 'employee');
  });

  test('returns null with invalid Bearer token', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('Authorization', 'Bearer invalid-bearer');
    (headers as jest.Mock).mockResolvedValue(mockHeaders);
    (verifySession as jest.Mock).mockResolvedValue({ isValid: false });

    const result = await getAuthenticatedEmployee();
    expect(result).toBeNull();
  });
});
