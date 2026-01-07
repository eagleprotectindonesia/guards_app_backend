import { getActiveGuards, updateGuardWithChangelog, getEffectiveStatus } from '@repo/database';
import { startOfDay } from 'date-fns';
import { Job } from 'bullmq';
import { GUARD_STATUS_CHECK_JOB_NAME } from '@repo/shared';

export class GuardStatusProcessor {
  async process(job: Job) {
    if (job.name === GUARD_STATUS_CHECK_JOB_NAME) {
      await this.checkGuardStatuses();
    }
  }

  private async checkGuardStatuses() {
    const todayStr = startOfDay(new Date()).toISOString().split('T')[0];

    try {
      console.log(`[GuardStatusProcessor] Running daily guard status check for ${todayStr}...`);

      const activeGuards = await getActiveGuards();
      let updatedCount = 0;

      for (const guard of activeGuards) {
        const shouldBeActive = getEffectiveStatus(true, guard.joinDate, guard.leftDate);

        if (!shouldBeActive) {
          console.log(`[GuardStatusProcessor] Deactivating guard ${guard.name} (${guard.id})`);

          await updateGuardWithChangelog(
            guard.id,
            {
              status: false,
            },
            null
          );

          updatedCount++;
        }
      }

      console.log(`[GuardStatusProcessor] Daily guard status check complete. Updated ${updatedCount} guards.`);
    } catch (error) {
      console.error(`[GuardStatusProcessor] Error checking guard statuses:`, error);
    }
  }
}
