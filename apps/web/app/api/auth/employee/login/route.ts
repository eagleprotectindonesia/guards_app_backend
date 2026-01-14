import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { z } from 'zod';
import { getEmployeeById, updateEmployee } from '@/lib/data-access/employees';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

const employeeLoginSchema = z.object({
  employeeId: z.string().min(1, 'ID Karyawan wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
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
    const { employeeId, password } = employeeLoginSchema.parse(body);

    const employee = await getEmployeeById(employeeId);

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
      return NextResponse.json({ message: 'Kredensial tidak valid', data: employee }, { status: 401 });
    }

    // Increment token version to invalidate other sessions
    const updatedEmployee = await updateEmployee(employee.id, {
      tokenVersion: { increment: 1 },
    });

    // Notify other active sessions to logout via Redis Stream
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
        updatedEmployee.tokenVersion.toString()
      );
      // Update cache for high-frequency polling
      await redis.set(`employee:${employee.id}:token_version`, updatedEmployee.tokenVersion.toString(), 'EX', 3600);
    } catch (error) {
      console.error('Failed to publish session revocation event:', error);
    }

    // Generate JWT token with token version
    const token = jwt.sign({ employeeId: employee.id, tokenVersion: updatedEmployee.tokenVersion }, JWT_SECRET, {
      expiresIn: '1d',
    });

    // Set HTTP-only cookie
    (await cookies()).set('employee_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    return NextResponse.json({ 
      message: 'Login berhasil',
      token, // Return token for mobile clients
      employee: {
        id: employee.id,
        name: employee.name
      }
    }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Kesalahan validasi', errors: error.issues }, { status: 400 });
    }
    console.error('Employee login error:', error);
    return NextResponse.json({ message: 'Kesalahan server internal' }, { status: 500 });
  }
}