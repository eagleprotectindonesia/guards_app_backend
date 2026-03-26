import { NextResponse } from 'next/server';
import type { EmployeeAttendanceCheckinErrorCode } from '@repo/shared';

type ErrorResponseOptions = {
  status: number;
  code: EmployeeAttendanceCheckinErrorCode;
  error: string;
  details?: Record<string, unknown>;
};

export function employeeShiftErrorResponse({ status, code, error, details }: ErrorResponseOptions) {
  return NextResponse.json(
    {
      code,
      error,
      ...(details ? { details } : {}),
    },
    { status }
  );
}
