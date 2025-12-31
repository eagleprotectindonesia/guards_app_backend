import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { Admin } from '@prisma/client';
import { getAdminById } from './data-access/admins';


export async function getAdminIdFromToken(): Promise<string> {
  // We trust the proxy.ts middleware has already validated the token and version
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (token) {
      const decoded = jwt.decode(token) as { adminId: string };
      return decoded?.adminId;
    }
  } catch (err) {
    console.warn('Admin token decode failed:', err);
  }

  return '';
}

export async function getCurrentAdmin(): Promise<Admin | null> {
  const adminId = await getAdminIdFromToken();
  if (!adminId) {
    return null;
  }

  try {
    return await getAdminById(adminId);
  } catch (error) {
    console.error('Error fetching current admin:', error);
    return null;
  }
}