import { Job } from 'bullmq';
import { DATA_CLEAN_JOB_NAME } from '@repo/database';
import { db as prisma } from '@repo/database';
import { ChatMessageStatus } from '@prisma/client';

export class MaintenanceProcessor {
  async process(job: Job) {
    if (job.name === DATA_CLEAN_JOB_NAME) {
      await this.clean();
    }
  }

  private async clean() {
    try {
      console.log(`[MaintenanceProcessor] Running data cleaning tasks...`);
      const result = await prisma.chatMessage.updateMany({
        where: {
          status: ChatMessageStatus.draft,
          draftExpiresAt: {
            lte: new Date(),
          },
        },
        data: {
          status: ChatMessageStatus.expired,
        },
      });

      if (result.count > 0) {
        console.log(`[MaintenanceProcessor] Expired ${result.count} stale chat drafts.`);
      }
    } catch (error) {
      console.error(`[MaintenanceProcessor] Data clean error:`, error);
    }
  }
}
