import { NextResponse } from 'next/server';
import { getAllSites } from '@/lib/data-access/sites';

export async function GET() {
  // TODO: Auth check (Admin only)
  try {
    const sites = await getAllSites();
    return NextResponse.json(sites);
  } catch (error) {
    console.error('Error fetching sites:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


