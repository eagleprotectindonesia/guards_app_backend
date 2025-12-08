import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { Admin } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export async function getAdminIdFromToken(): Promise<string | undefined> {
  // 1. Try to get Admin ID from Token
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string };
      return decoded.adminId;
    }
  } catch (err) {
    // Token invalid or verification failed
    console.warn('Admin token verification failed:', err);
  }

  // 2. Fallback: If no valid token, fetch the first admin (Dev/Test convenience)
  // This prevents 'Foreign key constraint violated' with 'mock-admin-id'
  try {
    const firstAdmin = await prisma.admin.findFirst();
    if (firstAdmin) {
      return firstAdmin.id;
    } else {
      // If absolutely no admin exists, we can't satisfy the FK.
      console.error('No admin found in database to attribute resolution to.');
      return undefined;
    }
  } catch (err) {
    console.error('Error fetching fallback admin:', err);
    return undefined;
  }
}

export async function getCurrentAdmin(): Promise<Admin | null> {
  const adminId = await getAdminIdFromToken();
  if (!adminId) {
    return null;
  }

  try {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
    });

    return admin;
  } catch (error) {
    console.error('Error fetching current admin:', error);
    return null;
  }
}
