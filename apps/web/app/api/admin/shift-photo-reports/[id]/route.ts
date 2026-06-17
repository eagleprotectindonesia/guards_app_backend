import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { getReportById } from '@/lib/data-access/shift-photo-reports';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const report = await getReportById(id);
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching shift photo report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
