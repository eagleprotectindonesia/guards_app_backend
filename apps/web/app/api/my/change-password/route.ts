import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { updateGuard } from '@/lib/data-access/guards';
import { redis } from '@/lib/redis';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: z.string().min(8, 'Kata sandi baru harus minimal 8 karakter'),
});

export async function POST(req: NextRequest) {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = changePasswordSchema.parse(body);

    if (!guard.hashedPassword) {
      return NextResponse.json(
        { message: 'Tidak ada kata sandi yang disetel untuk guard ini' },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(validated.currentPassword, guard.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json(
        { 
          message: 'Kata sandi saat ini tidak valid',
          errors: [{ field: 'currentPassword', message: 'Kata sandi saat ini tidak valid' }]
        },
        { status: 400 }
      );
    }

    const hashedNewPassword = await bcrypt.hash(validated.newPassword, 10);

    await updateGuard(guard.id, { hashedPassword: hashedNewPassword });

    // Clear Redis flag for password change requirement
    await redis.del(`guard:${guard.id}:must-change-password`);

    return NextResponse.json({ message: 'Kata sandi berhasil diperbarui!' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: 'Gagal memvalidasi input',
          errors: error.issues.map(issue => ({
            field: issue.path[0] as string,
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    console.error('Error changing guard password:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}
