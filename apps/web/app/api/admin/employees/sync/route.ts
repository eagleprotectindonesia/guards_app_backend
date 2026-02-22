import { NextResponse } from 'next/server';
import { EMPLOYEE_SYNC_JOB_NAME } from '@repo/shared';
import { employeeSyncQueue } from '@/lib/queues';

export async function POST() {
  try {
    console.log('[ManualSync] Starting manual employee sync...');
    const job = await employeeSyncQueue.add(EMPLOYEE_SYNC_JOB_NAME, { triggeredBy: 'api' });
    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Sync queued. Results will appear shortly.',
    });
  } catch (error) {
    console.error('[ManualSync] Failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to sync employees' }, { status: 500 });
  }
}
