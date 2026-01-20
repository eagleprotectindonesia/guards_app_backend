import { NextRequest, NextResponse } from 'next/server';
import { getChatMessages } from '@/lib/data-access/chat';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { getCurrentAdmin } from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const { employeeId } = await params;

  // Auth check: Either the employee themselves or an admin
  const employee = await getAuthenticatedEmployee();
  const admin = await getCurrentAdmin();

  if (!admin && (!employee || employee.id !== employeeId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') || '15');
    const cursor = searchParams.get('cursor') || undefined;

    const messages = await getChatMessages(employeeId, limit, cursor);
    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}