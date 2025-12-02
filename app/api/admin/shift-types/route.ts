import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShiftTypeSchema } from '@/lib/validations';

export async function GET(req: Request) {
  // TODO: Auth check (Admin only)
  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('siteId');

    const where = siteId ? { siteId } : {};

    const shiftTypes = await prisma.shiftType.findMany({
      where,
      include: { site: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(shiftTypes);
  } catch (error) {
    console.error('Error fetching shift types:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // TODO: Auth check (Admin only)
  try {
    const json = await req.json();
    const body = createShiftTypeSchema.parse(json);

    const shiftType = await prisma.shiftType.create({
      data: body,
    });

    return NextResponse.json(shiftType, { status: 201 });
  } catch (error: any) {
    console.error('Error creating shift type:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
