import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { searchEmployeesByName, searchAdminsByName } from '@repo/database';

export async function GET(req: Request) {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const [employeeResults, adminResults] = await Promise.all([
      searchEmployeesByName(q, employee.id),
      searchAdminsByName(q),
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

    return NextResponse.json({ users });
  } catch (error: unknown) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
