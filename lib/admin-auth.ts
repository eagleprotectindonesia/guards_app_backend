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
      const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string; tokenVersion?: number };
      
      // Verify token version against database
      const admin = await prisma.admin.findUnique({
        where: { id: decoded.adminId },
        select: { id: true, tokenVersion: true },
      });

      if (admin && (decoded.tokenVersion === undefined || decoded.tokenVersion === admin.tokenVersion)) {
        return decoded.adminId;
      } else {
        console.warn('Admin token version mismatch or invalid admin.');
      }
    }
  } catch (err) {
    // Token invalid or verification failed
    console.warn('Admin token verification failed:', err);
  }

  return undefined;
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