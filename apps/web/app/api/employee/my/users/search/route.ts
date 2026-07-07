import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getAllEmployees, getAllAdmins } from '@repo/database';

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

    const query = q.toLowerCase();

    const [allEmployees, allAdmins] = await Promise.all([
      getAllEmployees({ orderBy: { fullName: 'asc' } }),
      getAllAdmins({ name: 'asc' }),
    ]);

    const filteredEmployees = allEmployees
      .filter((e) => {
        if (e.id === employee.id) return false;
        return (
          e.fullName.toLowerCase().includes(query) ||
          (e.employeeNumber && e.employeeNumber.toLowerCase().includes(query)) ||
          (e.nickname && e.nickname.toLowerCase().includes(query))
        );
      })
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        type: 'employee' as const,
        name: e.fullName,
        employeeNumber: e.employeeNumber,
      }));

    const filteredAdmins = allAdmins
      .filter((a) => {
        return (
          a.name.toLowerCase().includes(query) ||
          a.email.toLowerCase().includes(query)
        );
      })
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        type: 'admin' as const,
        name: a.name,
        email: a.email,
      }));

    const users = [...filteredEmployees, ...filteredAdmins].slice(0, 30);

    return NextResponse.json({ users });
  } catch (error: unknown) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
