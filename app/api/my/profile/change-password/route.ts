import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export async function POST(req: Request) {
  const tokenCookie = cookies().get('guard_token');

  if (!tokenCookie) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let guardId: string;
  try {
    const decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as { guardId: string };
    guardId = decoded.guardId;
  } catch (error) {
    console.error('Guard token verification failed:', error);
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const guard = await prisma.guard.findUnique({
      where: { id: guardId },
    });

    if (!guard) {
      return NextResponse.json({ message: 'Guard not found' }, { status: 404 });
    }

    if (!guard.hashedPassword) {
      return NextResponse.json({ message: 'No password set for this guard' }, { status: 400 });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, guard.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json({ message: 'Invalid current password' }, { status: 400 });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.guard.update({
      where: { id: guardId },
      data: { hashedPassword: hashedNewPassword },
    });

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Validation error', errors: error.errors }, { status: 400 });
    }
    console.error('Error changing guard password:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
