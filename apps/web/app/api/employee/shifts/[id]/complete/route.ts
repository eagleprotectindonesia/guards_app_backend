import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { completeShift } from '@repo/database';
import { redis } from '@repo/database/redis';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: shiftId } = await params;

  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const shift = await completeShift(shiftId, employee.id);

    await redis.publish('events:shifts', JSON.stringify({ type: 'SHIFT_UPDATED', id: shift.id }));

    return NextResponse.json({ shift }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
