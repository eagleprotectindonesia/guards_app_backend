import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { DEFAULT_PASSWORD } from '@repo/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const employeeLoginSchema = z.object({
  employeeNumber: z.string().min(1, 'Nomor Karyawan wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

function getClientType(headersList: Headers): 'mobile' | 'pwa' {
  // Check for custom header from mobile app
  const clientType = headersList.get('x-client-type');
  if (clientType === 'mobile') return 'mobile';

  // Fallback to User-Agent detection
  const userAgent = headersList.get('user-agent');
  return isMobileUserAgent(userAgent) ? 'mobile' : 'pwa';
}

export async function POST(req: Request) {
  try {
    // Check for mobile device restriction
    if (process.env.REQUIRE_MOBILE_GUARD_LOGIN === 'true' || process.env.REQUIRE_MOBILE_EMPLOYEE_LOGIN === 'true') {
      const headersList = await headers();
      const userAgent = headersList.get('user-agent');

      if (!isMobileUserAgent(userAgent)) {
        return NextResponse.json({ message: 'Login dibatasi hanya untuk perangkat seluler.' }, { status: 403 });
      }
    }

    const body = await req.json();
    const { employeeNumber, password } = employeeLoginSchema.parse(body);

    const employee = await prisma.employee.findFirst({
      where: { employeeNumber, deletedAt: null },
    });

    if (!employee) {
      return NextResponse.json({ message: 'Karyawan tidak valid' }, { status: 401 });
    }

    if (employee.status === false) {
      return NextResponse.json({ message: 'Akun tidak aktif. Silakan hubungi administrator.' }, { status: 403 });
    }

    if (!employee.hashedPassword) {
      return NextResponse.json({ message: 'Karyawan tidak valid', data: employee }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, employee.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json({ message: 'Kredensial tidak valid' }, { status: 401 });
    }

    // Detect client type
    const headersList = await headers();
    const clientType = getClientType(headersList);

    // Increment token version to invalidate other sessions
    const updatedEmployee = await prisma.employee.update({
      where: { id: employee.id },
      data: { tokenVersion: { increment: 1 } },
    });

    // Notify other active sessions to logout via Redis Stream
    // Only sessions from DIFFERENT client types will be logged out
    try {
      await redis.xadd(
        `employee:stream:${employee.id}`,
        'MAXLEN',
        '~',
        100,
        '*',
        'type',
        'session_revoked',
        'newTokenVersion',
        updatedEmployee.tokenVersion.toString(),
        'clientType',
        clientType
      );

      // Update cache for high-frequency polling
      await redis.set(`employee:${employee.id}:token_version`, updatedEmployee.tokenVersion.toString(), 'EX', 3600);

      // If user is logging in with default password, set the force reset flag
      if (password === DEFAULT_PASSWORD) {
        await redis.set(`employee:${employee.id}:must-change-password`, 'true');
      }
    } catch (error) {
      console.error('Failed to publish session revocation event:', error);
    }

    // Generate JWT token with token version and client type
    const token = jwt.sign(
      {
        employeeId: employee.id,
        tokenVersion: updatedEmployee.tokenVersion,
        clientType,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Set HTTP-only cookie
    (await cookies()).set('employee_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return NextResponse.json(
      {
        message: 'Login berhasil',
        token, // Return token for mobile clients
        employee: {
          id: employee.id,
          name: employee.fullName,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Kesalahan validasi', errors: error.issues }, { status: 400 });
    }
    console.error('Employee login error:', error);
    return NextResponse.json({ message: 'Kesalahan server internal' }, { status: 500 });
  }
}
