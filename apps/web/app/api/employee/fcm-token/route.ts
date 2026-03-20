import { NextRequest, NextResponse } from 'next/server';
import { upsertEmployeeFcmToken, deleteEmployeeFcmToken } from '@repo/database';
import { getAuthenticatedEmployeeSession } from '@/lib/employee-auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedEmployeeSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token, deviceInfo } = body;

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const fcmToken = await upsertEmployeeFcmToken({
      token,
      employeeSessionId: session.sessionId,
      deviceInfo,
    });

    return NextResponse.json({ success: true, id: fcmToken.id });
  } catch (error) {
    console.error('Error in /api/employee/fcm-token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthenticatedEmployeeSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const result = await deleteEmployeeFcmToken({
      token,
      employeeSessionId: session.sessionId,
    });

    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    console.error('Error deleting /api/employee/fcm-token:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
