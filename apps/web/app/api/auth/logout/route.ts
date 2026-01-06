import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string };
      const cacheKey = `admin:token_version:${decoded.adminId}`;
      await redis.del(cacheKey);
    } catch {
      // Ignore error if token is invalid
    }
  }

  // Delete the admin_token cookie
  cookieStore.delete('admin_token');

  return NextResponse.json({ success: true });
}
