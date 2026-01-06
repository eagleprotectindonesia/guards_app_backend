import { BaseWorker } from './base-worker';
import { Redis } from 'ioredis';
import { getActiveGuards, updateGuardWithChangelog, getEffectiveStatus } from '@repo/database';
import { startOfDay } from 'date-fns';

const CLEAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class MaintenanceWorker extends BaseWorker {
  name = 'MaintenanceWorker';
  private redis: Redis;

  constructor() {
    super();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async start() {
    console.log(`[${this.name}] Started with 1h interval...`);
    this.runLoop();
  }

  private async runLoop() {
    while (!this.isShuttingDown) {
      try {
        await this.clean();
        await this.checkGuardStatuses();
      } catch (err) {
        console.error(`[${this.name}] Loop error:`, err);
      }

      if (!this.isShuttingDown) {
        // Sleep for the interval
        await new Promise(res => setTimeout(res, CLEAN_INTERVAL_MS));
      }
    }

    console.log(`[${this.name}] Loop exited`);
    await this.cleanup();
  }

  private async clean() {
    if (!(await this.acquireLock())) {
      console.log(`[${this.name}] Lock exists, skipping run.`);
      return;
    }

    try {
      console.log(`[${this.name}] Running data cleaning tasks...`);
      // Placeholder for data cleaning logic
      // e.g. delete old logs, archive shifts, etc.
    } finally {
      await this.releaseLock();
    }
  }

  private async checkGuardStatuses() {
    const todayStr = startOfDay(new Date()).toISOString().split('T')[0];
    const lastRunKey = 'worker:guard_status_update:last_run';

    const lastRun = await this.redis.get(lastRunKey);
    if (lastRun === todayStr) {
      return; // Already ran today
    }

    if (!(await this.acquireLock('worker:guard_status_update:lock'))) {
      return; // Another worker is handling this
    }

    try {
      console.log(`[${this.name}] Running daily guard status check for ${todayStr}...`);

      const activeGuards = await getActiveGuards();
      let updatedCount = 0;

      for (const guard of activeGuards) {
        // Current status is true (from getActiveGuards). Check effective status.
        const shouldBeActive = getEffectiveStatus(true, guard.joinDate, guard.leftDate);

        if (!shouldBeActive) {
          console.log(
            `[${this.name}] Deactivating guard ${guard.name} (${guard.id}) - Join: ${guard.joinDate}, Left: ${guard.leftDate}`
          );

          await updateGuardWithChangelog(
            guard.id,
            {
              status: false,
            },
            null
          ); // system update, no adminId

          updatedCount++;
        }
      }

      console.log(`[${this.name}] Daily guard status check complete. Updated ${updatedCount} guards.`);
      await this.redis.set(lastRunKey, todayStr, 'EX', 86400 * 2); // Expire in 2 days to be safe
    } catch (error) {
      console.error(`[${this.name}] Error checking guard statuses:`, error);
    } finally {
      await this.releaseLock('worker:guard_status_update:lock');
    }
  }

  private async acquireLock(key: string = 'worker:cleaner:lock'): Promise<boolean> {
    // Lock for 1 hour (default) or short duration for specific tasks if needed
    // Using 1 hour for general lock is fine.
    const result = await this.redis.set(key, 'locked', 'EX', 3600, 'NX');
    return result === 'OK';
  }

  private async releaseLock(key: string = 'worker:cleaner:lock') {
    await this.redis.del(key);
  }

  private async cleanup() {
    try {
      await this.redis.quit();
      console.log(`[${this.name}] Redis connection closed.`);
    } catch (e) {
      console.error(`[${this.name}] Error closing Redis:`, e);
    }
  }
}
