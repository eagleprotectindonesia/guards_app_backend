import { NextResponse } from 'next/server';
import { syncEmployeesFromExternal } from '@repo/database';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('[ManualSync] Starting manual employee sync...');
    const result = await syncEmployeesFromExternal();
    return NextResponse.json({
      success: true,
      added: result.added,
      updated: result.updated,
      deactivated: result.deactivated,
    });
  } catch (error) {
    console.error('[ManualSync] Failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync employees' },
      { status: 500 }
    );
  }
}
