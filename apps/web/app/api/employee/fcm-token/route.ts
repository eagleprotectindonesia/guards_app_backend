import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';

export async function POST(req: NextRequest) {
  try {
    const employee = await getAuthenticatedEmployee();

    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const employeeId = employee.id;

    const body = await req.json();
    const { token, deviceInfo } = body;

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // Upsert the token by token string itself
    // If multiple devices, each has a unique token but same employeeId
    const fcmToken = await prisma.fcmToken.upsert({
      where: {
        token: token,
      },
      update: {
        employeeId,
        deviceInfo: deviceInfo || null,
        updatedAt: new Date(),
      },
      create: {
        token,
        employeeId,
        deviceInfo: deviceInfo || null,
      },
    });

    return NextResponse.json({ success: true, id: fcmToken.id });
  } catch (error) {
    console.error('Error in /api/employee/fcm-token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
