import { cookies } from 'next/headers';
import { Admin } from '@prisma/client';
import { getAdminById } from './data-access/admins';
import { verifySession } from './auth/session';
import { AUTH_COOKIES } from './auth/constants';

export async function getAdminIdFromToken(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIES.ADMIN)?.value;

  if (!token) return '';

  const { isValid, userId } = await verifySession(token, 'admin');
  return isValid ? userId || '' : '';
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

export async function checkSuperAdmin() {
  const currentAdmin = await getCurrentAdmin();
  if (currentAdmin?.role !== 'superadmin') {
    return null;
  }
  return currentAdmin;
}
