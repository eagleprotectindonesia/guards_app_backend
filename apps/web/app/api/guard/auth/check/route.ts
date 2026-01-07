import { NextResponse } from 'next/server';
import { verifyGuardSession } from '@/lib/guard-auth';

export async function GET() {
  const isValid = await verifyGuardSession();

  if (!isValid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}
