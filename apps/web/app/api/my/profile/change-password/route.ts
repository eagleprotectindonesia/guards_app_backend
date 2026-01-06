import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedGuard } from '@/lib/guard-auth';
import { updateGuard } from '@/lib/data-access/guards';
import { redis } from '@/lib/redis';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export async function POST(req: Request) {
  const guard = await getAuthenticatedGuard();

  if (!guard) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    if (!guard.hashedPassword) {
      return NextResponse.json({ message: 'No password set for this guard' }, { status: 400 });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, guard.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json({ message: 'Invalid current password' }, { status: 400 });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await updateGuard(guard.id, { hashedPassword: hashedNewPassword });

    // Clear Redis flag for password change requirement
    await redis.del(`guard:${guard.id}:must-change-password`);

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Validation error', errors: error.issues }, { status: 400 });
    }
    console.error('Error changing guard password:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
