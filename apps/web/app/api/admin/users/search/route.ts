import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/admin-auth';
import { getAllAdmins, searchAdminsByName } from '@repo/database';

export async function GET(req: Request) {
  await requirePermission('user-calendar:view');

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();

    let results: { id: string; name: string; email: string }[];
    if (!q || q.length < 2) {
      results = await getAllAdmins({ name: 'asc' });
    } else {
      results = await searchAdminsByName(q);
    }

    const users = results.map((a) => ({
      id: a.id,
      type: 'admin' as const,
      name: a.name,
      email: a.email,
    }));

    return NextResponse.json({ users });
  } catch (error: unknown) {
    console.error('Error searching admins:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
