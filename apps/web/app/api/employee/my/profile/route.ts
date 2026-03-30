import { NextResponse } from 'next/server';
import { getEmployeeByIdWithRelations } from '@repo/database';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';

export async function GET() {
  const employeeAuth = await getAuthenticatedEmployee();

  if (!employeeAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const employee = await getEmployeeByIdWithRelations(employeeAuth.id);

  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const safeEmployee = {
    id: employee.id,
    name: employee.fullName,
    fullName: employee.fullName,
    phone: employee.phone,
    employeeNumber: employee.employeeNumber,
    mustChangePassword: !!employee.mustChangePassword,
    department: employee.department,
    jobTitle: employee.jobTitle,
    role: employee.role,
    officeId: employee.officeId,
    office: employee.office
      ? {
          id: employee.officeId,
          name: employee.office.name,
        }
      : null,
  };

  return NextResponse.json({ 
    employee: safeEmployee,
    guard: safeEmployee // Backward compatibility
  });
}
