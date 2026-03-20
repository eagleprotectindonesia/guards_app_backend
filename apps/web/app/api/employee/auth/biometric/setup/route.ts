import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getEmployeeForAuth, createEmployeeRefreshToken } from '@repo/database';
import { z } from 'zod';

const setupSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1),
  deviceInfo: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeId, password, deviceInfo } = setupSchema.parse(body);

    const employee = await getEmployeeForAuth(employeeId);

    if (!employee || !employee.hashedPassword || employee.deletedAt !== null || employee.status !== true) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, employee.hashedPassword);
    if (!isValid) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(40).toString('hex');

    // Hash the token for storage (SHA-256 is sufficient for high-entropy tokens)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Store in DB
    // We set a long expiry, e.g., 1 year (365 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    await createEmployeeRefreshToken({
      employeeId: employee.id,
      token: hashedToken,
      deviceInfo: deviceInfo || 'Current Device',
      expiresAt,
    });

    return NextResponse.json({
      message: 'Biometric setup successful',
      biometricToken: rawToken,
    });

  } catch (error) {
    console.error('Biometric setup error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
