import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  // Note: Auth check (Admin only) is handled by proxy.ts
  try {
    const shiftTypes = await prisma.shiftType.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(shiftTypes);
  } catch (error) {
    console.error('Error fetching shift types:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

