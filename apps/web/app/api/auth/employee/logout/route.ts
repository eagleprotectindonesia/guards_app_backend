import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('employee_token');
    return NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error during employee logout:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}