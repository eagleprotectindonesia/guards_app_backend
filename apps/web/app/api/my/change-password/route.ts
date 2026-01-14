import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { updateEmployee } from '@/lib/data-access/employees';
import { redis } from '@/lib/redis';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: z.string().min(8, 'Kata sandi baru harus minimal 8 karakter'),
});

export async function POST(req: NextRequest) {
  const employee = await getAuthenticatedEmployee();

  if (!employee) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validated = changePasswordSchema.parse(body);

    if (!employee.hashedPassword) {
      return NextResponse.json(
        { message: 'Tidak ada kata sandi yang disetel untuk karyawan ini' },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(validated.currentPassword, employee.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json(
        { 
          message: 'Kata sandi saat ini tidak valid',
          errors: [{ field: 'currentPassword', message: 'Kata sandi saat ini tidak valid' }]
        },
        { status: 400 }
      );
    }

    const hashedNewPassword = await bcrypt.hash(validated.newPassword, 10);

    await updateEmployee(employee.id, { hashedPassword: hashedNewPassword });

    // Clear Redis flag for password change requirement
    await redis.del(`employee:${employee.id}:must-change-password`);

    return NextResponse.json({ message: 'Kata sandi berhasil diperbarui!' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: 'Gagal memvalidasi input',
          errors: error.issues.map(issue => ({
            field: issue.path[0] as string,
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }
    console.error('Error changing employee password:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan internal' }, { status: 500 });
  }
}