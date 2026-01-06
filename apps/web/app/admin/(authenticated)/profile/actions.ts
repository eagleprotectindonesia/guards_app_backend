'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getAdminById, updateAdminWithChangelog } from '@/lib/data-access/admins';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordState = {
  message?: string;
  error?: string;
};

export async function changePassword(prevState: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  // 1. Validate Input
  const validation = changePasswordSchema.safeParse({
    currentPassword,
    newPassword,
    confirmPassword,
  });

  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  // 2. Validate Auth
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return { error: 'Unauthorized' };
  }

  let adminId: string;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string };
    adminId = decoded.adminId;
  } catch (error) {
    console.error('Invalid session:', error);
    return { error: 'Invalid session' };
  }

  try {
    // 3. Verify Current Password
    const admin = await getAdminById(adminId);

    if (!admin || !admin.hashedPassword) {
      return { error: 'Admin not found' };
    }

    const passwordMatch = await bcrypt.compare(currentPassword, admin.hashedPassword);

    if (!passwordMatch) {
      return { error: 'Incorrect current password' };
    }

    // 4. Update Password and increment version
    // We increment tokenVersion to invalidate sessions on all other devices/browsers
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedAdmin = await updateAdminWithChangelog(
      adminId,
      {
        hashedPassword,
        tokenVersion: { increment: 1 },
      },
      adminId // Self-modified
    );

    // 5. Generate NEW token with the NEW version and set it to keep current session active
    const newToken = jwt.sign(
      { adminId: updatedAdmin.id, email: updatedAdmin.email, tokenVersion: updatedAdmin.tokenVersion },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    (await cookies()).set('admin_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return { message: 'Password changed successfully' };
  } catch (error) {
    console.error('Change password error:', error);
    return { error: 'Internal server error' };
  }
}
