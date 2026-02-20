import { NextResponse } from 'next/server';
import { getAllEmployees } from '@/lib/data-access/employees';

export async function GET() {
  // Note: Auth check (Admin only) is handled by proxy.ts
  try {
    const employees = await getAllEmployees({ orderBy: { fullName: 'asc' } });
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
