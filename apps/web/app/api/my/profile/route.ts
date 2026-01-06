import { NextResponse } from 'next/server';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { redis } from '@/lib/redis';

export async function GET() {
  const guardAuth = await getAuthenticatedGuard();

  if (!guardAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mustChangePassword = await redis.get(`guard:${guardAuth.id}:must-change-password`);

  const safeGuard = {
    id: guardAuth.id,
    name: guardAuth.name,
    phone: guardAuth.phone,
    guardCode: guardAuth.guardCode,
    mustChangePassword: !!mustChangePassword,
  };

  return NextResponse.json({ guard: safeGuard });
}
