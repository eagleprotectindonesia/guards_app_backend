import { NextResponse } from 'next/server';
import { getAllAdmins } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export async function GET() {
  await requirePermission(PERMISSIONS.CHAT.VIEW);

  try {
    const admins = await getAllAdmins({ name: 'asc' });
    return NextResponse.json(
      admins.map(admin => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
      }))
    );
  } catch (error) {
    console.error('Error fetching admins:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
