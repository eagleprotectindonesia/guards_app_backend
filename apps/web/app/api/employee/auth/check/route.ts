import { NextResponse } from 'next/server';
import { verifyEmployeeSession } from '@/lib/employee-auth';

export async function GET() {
  const isValid = await verifyEmployeeSession();

  if (!isValid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}