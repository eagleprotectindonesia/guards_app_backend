import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { getEmployeeAttendanceByDate } from '@repo/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await requirePermission('dashboard-hr:view');

  const { searchParams } = request.nextUrl;
  const dateStr = searchParams.get('date');
  const departmentsRaw = searchParams.get('department');
  const locationRaw = searchParams.get('location');

  if (!dateStr) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const departments = departmentsRaw
    ? departmentsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const officeIds: string[] = [];
  const siteIds: string[] = [];

  if (locationRaw) {
    const parts = locationRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (part.startsWith('o:')) {
        officeIds.push(part.slice(2));
      } else if (part.startsWith('s:')) {
        siteIds.push(part.slice(2));
      }
    }
  }

  const employees = await getEmployeeAttendanceByDate(date, {
    departments: departments?.length ? departments : undefined,
    officeIds: officeIds.length ? officeIds : undefined,
    siteIds: siteIds.length ? siteIds : undefined,
  });

  return NextResponse.json({ date: dateStr, count: employees.length, employees });
}
