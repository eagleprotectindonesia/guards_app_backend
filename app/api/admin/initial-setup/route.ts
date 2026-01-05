import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST() {
  try {
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'INITIAL_ADMIN_EMAIL or INITIAL_ADMIN_PASSWORD not set in environment' },
        { status: 500 }
      );
    }

    // Check if any superadmin already exists to prevent repeated setup
    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      return NextResponse.json(
        { message: 'Admin already exists', email: existingAdmin.email },
        { status: 200 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.create({
      data: {
        name: 'System Admin',
        email,
        hashedPassword,
        role: 'superadmin',
      },
    });

    return NextResponse.json(
      { message: 'Successfully created initial admin', email: admin.email },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Initial setup error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
