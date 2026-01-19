'use server';

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { getAdminById, updateAdminWithChangelog } from '@/lib/data-access/admins';
import { generate2FASecret, generateQRCode, verify2FAToken } from '@/lib/auth/2fa';
import { revalidatePath } from 'next/cache';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

async function getAdminIdFromSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string };
    return decoded.adminId;
  } catch {
    return null;
  }
}

export type Setup2FAState = {
  secret?: string;
  qrCode?: string;
  error?: string;
};

export async function setup2FA(): Promise<Setup2FAState> {
  const adminId = await getAdminIdFromSession();
  if (!adminId) return { error: 'Unauthorized' };

  try {
    const admin = await getAdminById(adminId);
    if (!admin) return { error: 'Admin not found' };

    const secret = generate2FASecret();
    const qrCode = await generateQRCode(admin.email, secret);

    return { secret, qrCode };
  } catch (error) {
    console.error('[2FA] Setup error:', error);
    return { error: 'Failed to initiate 2FA setup' };
  }
}

export type Enable2FAState = {
  success?: boolean;
  error?: string;
};

export async function enable2FA(secret: string, token: string): Promise<Enable2FAState> {
  const adminId = await getAdminIdFromSession();
  if (!adminId) return { error: 'Unauthorized' };

  try {
    const isValid = await verify2FAToken(token, secret);
    if (!isValid) {
      return { error: 'Invalid verification code' };
    }

    await updateAdminWithChangelog(
      adminId,
      {
        twoFactorSecret: secret,
        twoFactorEnabled: true,
      },
      adminId
    );

    revalidatePath('/admin/(authenticated)/profile');
    return { success: true };
  } catch (error) {
    console.error('[2FA] Enable error:', error);
    return { error: 'Failed to enable 2FA' };
  }
}

export async function disable2FA(): Promise<Enable2FAState> {
  const adminId = await getAdminIdFromSession();
  if (!adminId) return { error: 'Unauthorized' };

  try {
    await updateAdminWithChangelog(
      adminId,
      {
        twoFactorSecret: null,
        twoFactorEnabled: false,
      },
      adminId
    );

    revalidatePath('/admin/(authenticated)/profile');
    return { success: true };
  } catch (error) {
    console.error('[2FA] Disable error:', error);
    return { error: 'Failed to disable 2FA' };
  }
}
