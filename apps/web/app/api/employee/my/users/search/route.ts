import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { searchEmployeesByName, searchAdminsByName, getDistinctDepartments } from '@repo/database';

export async function GET(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [], departments: [] });
    }

    const [employeeResults, adminResults, allDepartments] = await Promise.all([
      searchEmployeesByName(q, employee.id),
      searchAdminsByName(q),
      getDistinctDepartments(),
    ]);

    const users = [
      ...employeeResults.map((e) => ({
        id: e.id,
        type: 'employee' as const,
        name: e.fullName,
        employeeNumber: e.employeeNumber,
      })),
      ...adminResults.map((a) => ({
        id: a.id,
        type: 'admin' as const,
        name: a.name,
        email: a.email,
      })),
    ].slice(0, 30);

    const lowerQ = q.toLowerCase();
    const departments = allDepartments
      .filter(d => d.toLowerCase().includes(lowerQ))
      .slice(0, 10)
      .map(name => ({ name }));

    return NextResponse.json({ users, departments });
  } catch (error: unknown) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
