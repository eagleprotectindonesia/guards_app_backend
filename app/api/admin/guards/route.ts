import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createGuardSchema } from '@/lib/validations';

export async function GET(req: Request) {
  // TODO: Auth check (Admin only)
  try {
    const guards = await prisma.guard.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(guards);
  } catch (error) {
    console.error('Error fetching guards:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // TODO: Auth check (Admin only)
  try {
    const json = await req.json();
    const body = createGuardSchema.parse(json);

    // Check for duplicate phone
    const existingGuard = await prisma.guard.findUnique({
      where: { phone: body.phone },
    });

    if (existingGuard) {
      return NextResponse.json({ error: 'Guard with this phone already exists' }, { status: 409 });
    }

    const guard = await prisma.guard.create({
      data: body,
    });

    return NextResponse.json(guard, { status: 201 });
  } catch (error: any) {
    console.error('Error creating guard:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
