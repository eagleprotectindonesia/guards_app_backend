import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { updateEmployee } from '@/lib/data-access/employees';
import { redis } from '@/lib/redis';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export async function POST(req: Request) {
  const employee = await getAuthenticatedEmployee();

  if (!employee) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    if (!employee.hashedPassword) {
      return NextResponse.json({ message: 'No password set for this employee' }, { status: 400 });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, employee.hashedPassword);

    if (!passwordMatch) {
      return NextResponse.json({ message: 'Invalid current password' }, { status: 400 });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await updateEmployee(employee.id, { hashedPassword: hashedNewPassword });

    // Clear Redis flag for password change requirement
    await redis.del(`employee:${employee.id}:must-change-password`);

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Validation error', errors: error.issues }, { status: 400 });
    }
    console.error('Error changing employee password:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}