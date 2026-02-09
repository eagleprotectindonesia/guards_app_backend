import jwt from 'jsonwebtoken';
import type { Admin, Employee } from '@repo/database';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-e2e-testing';

/**
 * Generate JWT token for employee authentication
 */
export function generateEmployeeToken(employee: Employee): string {
  return jwt.sign(
    {
      id: employee.id,
      phone: employee.phone,
      role: employee.role,
      type: 'employee',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Generate JWT token for admin authentication
 */
export function generateAdminToken(admin: Admin): string {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Create authorization header for employee
 */
export function getEmployeeAuthHeader(employee: Employee): { Authorization: string } {
  const token = generateEmployeeToken(employee);
  return { Authorization: `Bearer ${token}` };
}

/**
 * Create authorization header for admin
 */
export function getAdminAuthHeader(admin: Admin): { Authorization: string } {
  const token = generateAdminToken(admin);
  return { Authorization: `Bearer ${token}` };
}
