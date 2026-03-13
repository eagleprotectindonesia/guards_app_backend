import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';

export async function GET() {
  const employeeAuth = await getAuthenticatedEmployee();

  if (!employeeAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const safeEmployee = {
    id: employeeAuth.id,
    name: employeeAuth.fullName,
    fullName: employeeAuth.fullName,
    phone: employeeAuth.phone,
    employeeNumber: employeeAuth.employeeNumber,
    mustChangePassword: !!employeeAuth.mustChangePassword,
    department: employeeAuth.department,
    jobTitle: employeeAuth.jobTitle,
    role: employeeAuth.role,
  };

  return NextResponse.json({ 
    employee: safeEmployee,
    guard: safeEmployee // Backward compatibility
  });
}
