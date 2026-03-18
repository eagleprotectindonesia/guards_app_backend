import { NextResponse } from 'next/server';
import { getAllSites } from '@repo/database';

export async function GET() {
  // Note: Auth check (Admin only) is handled by proxy.ts
  try {
    const sites = await getAllSites();
    return NextResponse.json(sites);
  } catch (error) {
    console.error('Error fetching sites:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


