import { NextResponse } from 'next/server';
import { getAuthenticatedGuard } from '@/lib/guard-auth';

export async function GET() {
  const guardAuth = await getAuthenticatedGuard();

  if (!guardAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // guardAuth contains the full guard object (including hashed password if not selected otherwise in guard-auth,
  // but let's just return safe fields)

  const safeGuard = {
    id: guardAuth.id,
    name: guardAuth.name,
    phone: guardAuth.phone,
    guardCode: guardAuth.guardCode,
    // Add other fields you want to expose
  };

  return NextResponse.json({ guard: safeGuard });
}
