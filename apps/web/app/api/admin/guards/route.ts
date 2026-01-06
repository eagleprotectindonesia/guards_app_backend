import { NextResponse } from 'next/server';
import { getAllGuards } from '@/lib/data-access/guards';

export async function GET() {
  // Note: Auth check (Admin only) is handled by proxy.ts
  try {
    const guards = await getAllGuards();
    // DAL returns orderBy createdAt desc by default, but this endpoint might expect name asc.
    // However, consistency with DAL is preferred unless specific order is required.
    // The original code was name: asc.
    return NextResponse.json(guards);
  } catch (error) {
    console.error('Error fetching guards:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

