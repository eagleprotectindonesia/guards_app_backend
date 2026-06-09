import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { createEmployeeSession } from '@/lib/auth/session-helper';

const loginSchema = z.object({
  biometricToken: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { biometricToken } = loginSchema.parse(body);

    // Hash the incoming token to match storage
    const hashedToken = crypto.createHash('sha256').update(biometricToken).digest('hex');

    // Find the token in DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: { employee: true },
    });

    if (!storedToken) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    // Check expiry
    if (storedToken.expiresAt < new Date()) {
      return NextResponse.json({ message: 'Token expired' }, { status: 401 });
    }

    // Check revocation
    if (storedToken.revokedAt) {
      return NextResponse.json({ message: 'Token revoked' }, { status: 401 });
    }

    const employee = storedToken.employee;

    const { token } = await createEmployeeSession({
      employeeId: employee.id,
      clientType: 'mobile',
      deviceInfo: 'Biometric Login',
    });

    return NextResponse.json({
      message: 'Login successful',
      token,
      employee: {
        id: employee.id,
        name: employee.fullName,
        role: employee.role,
        // Add other needed fields
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Validation error', errors: error.issues }, { status: 400 });
    }
    console.error('Biometric login error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
