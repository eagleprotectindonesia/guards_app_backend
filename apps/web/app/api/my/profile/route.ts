import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { redis } from '@/lib/redis';

export async function GET() {
  const employeeAuth = await getAuthenticatedEmployee();

  if (!employeeAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mustChangePassword = await redis.get(`employee:${employeeAuth.id}:must-change-password`);

  const safeEmployee = {
    id: employeeAuth.id,
    name: employeeAuth.fullName,
    firstName: employeeAuth.firstName,
    lastName: employeeAuth.lastName,
    phone: employeeAuth.phone,
    employeeCode: employeeAuth.employeeCode,
    mustChangePassword: !!mustChangePassword,
    department: employeeAuth.department,
    designation: employeeAuth.designation,
  };

  return NextResponse.json({ 
    employee: safeEmployee,
    guard: safeEmployee // Backward compatibility
  });
}