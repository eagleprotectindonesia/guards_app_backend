import { NextResponse } from 'next/server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

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

    // Optional: Increment token version? 
    // If we increment token version, we might invalidate other sessions.
    // Biometric login is just another session. Maybe we don't need to increment.
    // But we need the current token version for the JWT.

    // Generate JWT
    const token = jwt.sign(
      { 
        employeeId: employee.id, 
        tokenVersion: employee.tokenVersion,
        clientType: 'mobile' 
      }, 
      JWT_SECRET, 
      { expiresIn: '1d' }
    );
    
    // Set cookie if needed (for hybrid apps), but primarily return JSON for mobile
    (await cookies()).set('employee_token', token, {
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
