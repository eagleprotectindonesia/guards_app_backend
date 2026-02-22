import { Job } from 'bullmq';
import { syncEmployeesFromExternal } from '@repo/database';

export class EmployeeSyncProcessor {
  async process(job: Job) {
    console.log(`[EmployeeSyncProcessor] Starting sync job: ${job.id}`);

    try {
      const result = await syncEmployeesFromExternal({ type: 'system' });

      console.log(`[EmployeeSyncProcessor] Sync job ${job.id} completed:`, result);

      // Trigger cache revalidation in the web app
      const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
      const revalidateSecret = process.env.INTERNAL_REVALIDATE_SECRET;

      if (revalidateSecret) {
        try {
          const revalidateRes = await fetch(`${webAppUrl}/api/revalidate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-revalidate-token': revalidateSecret,
            },
            body: JSON.stringify({
              paths: ['/admin/employees', '/admin/offices', '/admin/shifts'],
            }),
          });

          if (revalidateRes.ok) {
            console.log('[EmployeeSyncProcessor] Cache revalidation triggered successfully');
          } else {
            console.error(
              `[EmployeeSyncProcessor] Cache revalidation failed with status ${revalidateRes.status}:`,
              await revalidateRes.text()
            );
          }
        } catch (revalidateErr) {
          console.error('[EmployeeSyncProcessor] Error triggering cache revalidation:', revalidateErr);
        }
      } else {
        console.warn('[EmployeeSyncProcessor] INTERNAL_REVALIDATE_SECRET not set. Skipping cache revalidation.');
      }

      return result;
    } catch (error) {
      console.error('[EmployeeSyncProcessor] Sync job failed:', error);
      throw error;
    }
  }
}
