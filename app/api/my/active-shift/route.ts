import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

export async function GET(req: Request) {
  const tokenCookie = (await cookies()).get('guard_token');

  if (!tokenCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let guardId: string;
  try {
    const decoded = jwt.verify(tokenCookie.value, JWT_SECRET) as { guardId: string };
    guardId = decoded.guardId;
  } catch (error) {
    console.error('Guard token verification failed:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    const activeShift = await prisma.shift.findFirst({
      where: {
        guardId,
        status: { in: ['scheduled', 'in_progress'] }, // Shift must be scheduled or in progress
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { site: true, shiftType: true, guard: true }, // Include new relations
    });

    return NextResponse.json({ activeShift });
  } catch (error) {
    console.error('Error fetching active shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
