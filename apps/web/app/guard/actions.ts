'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { updateGuard } from '@/lib/data-access/guards';
import { redis } from '@/lib/redis';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: z.string().min(8, 'Kata sandi baru harus minimal 8 karakter'),
});

export type PasswordChangeState = {
  success?: boolean;
  message?: string;
  errors?: { field: string; message: string }[];
};

export async function changeGuardPasswordAction(
  prevState: PasswordChangeState,
  formData: FormData
): Promise<PasswordChangeState> {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    return { success: false, message: 'Unauthorized' };
  }

  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  try {
    const validated = changePasswordSchema.parse({ currentPassword, newPassword });

    if (!guard.hashedPassword) {
      return { success: false, message: 'Tidak ada kata sandi yang disetel untuk guard ini' };
    }

    const passwordMatch = await bcrypt.compare(validated.currentPassword, guard.hashedPassword);

    if (!passwordMatch) {
      return { 
        success: false, 
        message: 'Kata sandi saat ini tidak valid',
        errors: [{ field: 'currentPassword', message: 'Kata sandi saat ini tidak valid' }]
      };
    }

    const hashedNewPassword = await bcrypt.hash(validated.newPassword, 10);

    await updateGuard(guard.id, { hashedPassword: hashedNewPassword });

    // Clear Redis flag for password change requirement
    await redis.del(`guard:${guard.id}:must-change-password`);

    return { success: true, message: 'Kata sandi berhasil diperbarui!' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: 'Gagal memvalidasi input',
        errors: error.issues.map(issue => ({
          field: issue.path[0] as string,
          message: issue.message,
        })),
      };
    }
    console.error('Error changing guard password:', error);
    return { success: false, message: 'Terjadi kesalahan internal' };
  }
}
