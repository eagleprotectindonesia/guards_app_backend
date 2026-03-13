import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { EmployeePasswordPolicyError, setEmployeePassword } from '@/lib/data-access/employees';

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

    await setEmployeePassword({
      employeeId: employee.id,
      newPassword: validated.newPassword,
      actor: { type: 'employee' },
      requireCurrentPassword: validated.currentPassword,
      mustChangePassword: false,
    });

    return NextResponse.json({ message: 'Kata sandi berhasil diperbarui!' });
  } catch (error) {
    if (error instanceof EmployeePasswordPolicyError) {
      const message =
        error.field === 'currentPassword'
          ? 'Kata sandi saat ini tidak valid'
          : 'Kata sandi baru tidak boleh sama dengan 3 kata sandi terakhir';

      return NextResponse.json(
        {
          message,
          errors: [{ field: error.field, message }],
        },
        { status: 400 }
      );
    }

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
