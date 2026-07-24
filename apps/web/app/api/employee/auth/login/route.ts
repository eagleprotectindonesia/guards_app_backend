import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { DEFAULT_PASSWORD, verifyPassword } from '@repo/database';
import { createEmployeeSession } from '@/lib/auth/session-helper';
import { checkLoginThrottle, recordLoginFailure, clearLoginFailures, clientIp, RateLimitBackendError } from '@repo/auth-server';

type EmployeeClientType = 'mobile' | 'pwa';

const employeeLoginSchema = z.object({
  employeeNumber: z.string().min(1, 'Nomor Karyawan wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

function getClientType(headersList: Headers): EmployeeClientType {
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

    const normalizedEmployeeNumber = employeeNumber.toUpperCase();
    const ip = clientIp(req);

    // Enforce per-account + per-IP rate limit
    const throttle = await checkLoginThrottle({ accountKey: normalizedEmployeeNumber, ip });
    if (!throttle.allowed) {
      return NextResponse.json(
        { message: 'Terlalu banyak percobaan. Silakan coba lagi nanti.' },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfter ?? 900) } }
      );
    }

    const employee = await prisma.employee.findFirst({
      where: { employeeNumber: normalizedEmployeeNumber, deletedAt: null },
    });

    if (!employee) {
      await recordLoginFailure({ accountKey: normalizedEmployeeNumber, ip });
      return NextResponse.json({ message: 'Karyawan tidak valid' }, { status: 401 });
    }

    if (employee.status === false) {
      await recordLoginFailure({ accountKey: normalizedEmployeeNumber, ip });
      return NextResponse.json({ message: 'Akun tidak aktif. Silakan hubungi administrator.' }, { status: 403 });
    }

    if (!employee.hashedPassword) {
      await recordLoginFailure({ accountKey: normalizedEmployeeNumber, ip });
      return NextResponse.json({ message: 'Karyawan tidak valid' }, { status: 401 });
    }

    const passwordMatch = await verifyPassword(password, employee.hashedPassword);

    if (!passwordMatch) {
      await recordLoginFailure({ accountKey: normalizedEmployeeNumber, ip });
      return NextResponse.json({ message: 'Kredensial tidak valid' }, { status: 401 });
    }

    await clearLoginFailures({ accountKey: normalizedEmployeeNumber });

    // Detect client type
    const headersList = await headers();
    const clientType = getClientType(headersList);
    const deviceInfo = headersList.get('user-agent');

    const { token } = await createEmployeeSession({
      employeeId: employee.id,
      clientType,
      deviceInfo: deviceInfo || 'Unknown Device',
    });

    const mustChangePassword = employee.mustChangePassword || password === DEFAULT_PASSWORD;

    if (mustChangePassword !== employee.mustChangePassword) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { mustChangePassword: mustChangePassword },
      });
    }

    return NextResponse.json(
      {
        message: 'Login berhasil',
        token, // Return token for mobile clients
        employee: {
          id: employee.id,
          name: employee.fullName,
          mustChangePassword,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Kesalahan validasi', errors: error.issues }, { status: 400 });
    }
    if (error instanceof RateLimitBackendError) {
      return NextResponse.json({ message: 'Layanan tidak tersedia. Silakan coba lagi.' }, { status: 503 });
    }
    console.error('Employee login error:', error);
    return NextResponse.json({ message: 'Kesalahan server internal' }, { status: 500 });
  }
}
