import { NextResponse } from 'next/server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { AUTH_COOKIES, JWT_SECRET } from '@/lib/auth/constants';
import { getEmployeeSessionExpiry } from '@/lib/auth/employee-sessions';
import { redis } from '@repo/database';

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
      // Security: if using a revoked token, we might want to alert or revoke all tokens?
      // For now, just deny.
      return NextResponse.json({ message: 'Token revoked' }, { status: 401 });
    }

    const employee = storedToken.employee;

    const expiresAt = getEmployeeSessionExpiry();
    const session = await prisma.$transaction(async tx => {
      await tx.employeeSession.updateMany({
        where: {
          employeeId: employee.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return tx.employeeSession.create({
        data: {
          employeeId: employee.id,
          clientType: 'mobile',
          deviceInfo: 'Biometric Login',
          expiresAt,
        },
      });
    });

    try {
      await redis.xadd(
        `employee:stream:${employee.id}`,
        'MAXLEN',
        '~',
        100,
        '*',
        'type',
        'session_revoked',
        'reason',
        'logged_in_elsewhere',
        'sessionId',
        session.id
      );
    } catch (error) {
      console.error('Failed to publish biometric session revocation event:', error);
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        employeeId: employee.id, 
        sessionId: session.id,
        clientType: 'mobile' 
      }, 
      JWT_SECRET, 
      { expiresIn: '1d' }
    );
    
    // Set cookie if needed (for hybrid apps), but primarily return JSON for mobile
    (await cookies()).set(AUTH_COOKIES.EMPLOYEE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
      path: '/',
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
