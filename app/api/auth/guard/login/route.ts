import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const guardLoginSchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, password } = guardLoginSchema.parse(body);

    const guard = await prisma.guard.findUnique({
      where: { phone },
    });
    console.log(guard);

    if (!guard) {
      return NextResponse.json({ message: 'Invalid Guard' }, { status: 401 });
    }

    if (!guard || !guard.hashedPassword) {
      return NextResponse.json({ message: 'Invalid adada', data: guard }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, guard.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json({ message: 'Invalid credentials', data: guard }, { status: 401 });
    }

    // Increment token version to invalidate other sessions
    const updatedGuard = await prisma.guard.update({
      where: { id: guard.id },
      data: { tokenVersion: { increment: 1 } },
    });

    // Generate JWT token with token version
    const token = jwt.sign({ guardId: guard.id, tokenVersion: updatedGuard.tokenVersion }, JWT_SECRET, {
      expiresIn: '1d',
    });

    // Set HTTP-only cookie
    (await cookies()).set('guard_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return NextResponse.json({ message: 'Login successful' }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Validation error', errors: error.issues }, { status: 400 });
    }
    console.error('Guard login error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
