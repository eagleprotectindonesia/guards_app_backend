import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { regenerateReport } from '@/lib/data-access/shift-photo-reports';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const newReport = await regenerateReport(id, session.id);
    return NextResponse.json({ reportId: newReport.id, status: newReport.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate report';
    console.error('Error regenerating shift photo report:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
