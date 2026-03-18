import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { EmployeePasswordPolicyError, setEmployeePassword } from '@repo/database';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: z.string().min(8, 'Kata sandi baru harus minimal 8 karakter'),
});

type PasswordChangeErrorResponse = {
  success: false;
  code: 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INVALID_CURRENT_PASSWORD' | 'PASSWORD_REUSED' | 'INTERNAL_ERROR';
  message: string;
  errors?: Record<string, string[]>;
};

function errorResponse(
  status: number,
  payload: PasswordChangeErrorResponse
) {
  return NextResponse.json(payload, { status });
}

export async function POST(req: NextRequest) {
  const employee = await getAuthenticatedEmployee();

  if (!employee) {
    return errorResponse(401, {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
      errors: {
        _form: ['Unauthorized'],
      },
    });
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

    return NextResponse.json({ success: true, message: 'Kata sandi berhasil diperbarui!' });
  } catch (error) {
    if (error instanceof EmployeePasswordPolicyError) {
      const isCurrentPasswordError = error.field === 'currentPassword';
      const message = isCurrentPasswordError
        ? 'Kata sandi saat ini tidak valid'
        : 'Kata sandi baru tidak boleh sama dengan 3 kata sandi terakhir';

      return errorResponse(400, {
        success: false,
        code: isCurrentPasswordError ? 'INVALID_CURRENT_PASSWORD' : 'PASSWORD_REUSED',
        message,
        errors: {
          [isCurrentPasswordError ? 'currentPassword' : 'newPassword']: [message],
        },
      });
    }

    if (error instanceof z.ZodError) {
      const errors = error.issues.reduce<Record<string, string[]>>((acc, issue) => {
        const field = String(issue.path[0] ?? '_form');
        if (!acc[field]) {
          acc[field] = [];
        }
        acc[field].push(issue.message);
        return acc;
      }, {});

      return errorResponse(400, {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Gagal memvalidasi input',
        errors,
      });
    }

    console.error('Error changing employee password:', error);
    return errorResponse(500, {
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan internal',
      errors: {
        _form: ['Terjadi kesalahan internal'],
      },
    });
  }
}
